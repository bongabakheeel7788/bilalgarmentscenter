// P93 — the POS's report arithmetic, ported line for line from
// modules/reports/service.js and modules/cash/service.js onto the mirror.
// Test 97ay runs both engines over the same fixture and asserts equality; when
// a formula changes on the POS it changes here, or the test says so.
import { T, c, pc, P, N, F, num, pct, change, first, all, local, previous, SOLD, NET, COST, ROUND_OFF, RECEIVABLE, LANDED, RETAIL } from './q.js';
import { can } from './auth.js';

const one = async (db, sql, ...args) => num((await first(db, sql, ...args)).v);

// ── sales ───────────────────────────────────────────────────────────────────
export async function salesSummary(db, user, w, compare = true) {
  const r = await first(db, `
    SELECT ${N(`SUM(${pc('il', 'unit_price')} * ${c('il', 'qty')})`)} AS gross,
           ${N(`SUM(${pc('il', 'line_discount')} + ${pc('il', 'bill_discount_share')})`)} AS discount,
           ${N(NET)} AS net, ${N(COST)} AS cost,
           COUNT(DISTINCT ${c('il', 'invoice_id')}) AS bills, ${N(`SUM(${c('il', 'qty')})`)} AS units
    ${SOLD}`, w.from, w.to);
  const refunds = await one(db, `SELECT ${N(`SUM(${pc('r', 'refund_amount')})`)} AS v FROM ${T('returns')} r
    WHERE ${c('r', 'business_date')} BETWEEN ?1 AND ?2 AND ${c('r', 'status')} = 'POSTED'`, w.from, w.to);
  const roundOff = await one(db, ROUND_OFF, w.from, w.to);
  const net = num(r.net) + roundOff;
  const out = { ...w, gross: F(num(r.gross)), discount: F(num(r.discount)), net: F(net), round_off: F(roundOff),
    bills: num(r.bills), units: num(r.units), refunds: F(refunds),
    average_basket: r.bills ? F(Math.round(net / r.bills)) : '0.00', upt: r.bills ? Math.round((r.units / r.bills) * 100) / 100 : 0 };
  if (can(user, 'report.margin')) { out.cost = F(num(r.cost)); out.profit = F(net - num(r.cost)); out.margin_pct = net ? pct(net - num(r.cost), net) : 0; }
  if (compare) {
    const p = previous(w);
    const b = await salesSummary(db, user, { period: 'Custom', from: p.from, to: p.to }, false);
    out.before = { from: p.from, to: p.to, net: b.net, bills: b.bills, units: b.units, ...(b.profit !== undefined ? { profit: b.profit } : {}) };
    out.change = { net: change(out.net, b.net), bills: change(out.bills, b.bills), units: change(out.units, b.units), ...(b.profit !== undefined ? { profit: change(out.profit, b.profit) } : {}) };
  }
  return out;
}

export async function byMethod(db, w) {
  const list = await all(db, `
    SELECT ${c('p', 'method')} AS method, COUNT(DISTINCT ${c('p', 'invoice_id')}) AS bills, SUM(${pc('p', 'amount')}) AS amount
    FROM ${T('payments')} p JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('p', 'invoice_id')} AND ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')}
    WHERE ${c('i', 'business_date')} BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY 3 DESC`, w.from, w.to);
  return list.map(r => ({ method: r.method, bills: num(r.bills), amount: F(num(r.amount)) }));
}

/** by category (parent › child) — an off-list line keeps its own row (P65) */
export async function byCategory(db, user, w) {
  const seeCost = can(user, 'report.margin');
  const label = `COALESCE(${c('pc', 'name')} || ' › ' || ${c('ca', 'name')}, ${c('ca', 'name')}, CASE WHEN ${c('il', 'variant_id')} IS NULL THEN 'Off-list items' ELSE 'Uncategorised' END)`;
  const list = await all(db, `SELECT ${label} AS label, SUM(${c('il', 'qty')}) AS units, ${NET} AS net, ${COST} AS cost ${SOLD} GROUP BY 1 ORDER BY net DESC`, w.from, w.to);
  return list.map(r => ({ label: r.label, units: num(r.units), net: F(num(r.net)), ...(seeCost ? { profit: F(num(r.net) - num(r.cost)) } : {}) }));
}

/** UPT & ABV per salesman — attribution from the line, not the bill */
export async function bySalesman(db, w) {
  const list = await all(db, `
    SELECT ${c('u', 'id')} AS id, ${c('u', 'name')} AS name, COUNT(DISTINCT ${c('il', 'invoice_id')}) AS bills,
           ${N(`SUM(${c('il', 'qty')})`)} AS units, ${N(`SUM(${pc('il', 'line_total')})`)} AS net
    FROM ${T('users')} u
    JOIN ${T('invoice_lines')} il ON ${c('il', 'salesperson_id')} = ${c('u', 'id')}
    JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('il', 'invoice_id')} AND ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')}
    WHERE ${c('i', 'business_date')} BETWEEN ?1 AND ?2 GROUP BY 1, 2 ORDER BY net DESC`, w.from, w.to);
  return list.map(r => ({ id: num(r.id), name: r.name, bills: num(r.bills), units: num(r.units), net: F(num(r.net)),
    upt: r.bills ? Math.round(r.units / r.bills * 100) / 100 : 0, abv: r.bills ? F(Math.round(num(r.net) / r.bills)) : '0.00' }));
}

/** top items in the window */
export async function itemWise(db, user, w, limit = 60) {
  const seeCost = can(user, 'report.margin');
  const list = await all(db, `
    SELECT COALESCE(${c('s', 'name')}, ${c('il', 'description')}) AS style, ${c('s', 'code')} AS code, ${c('sz', 'label')} AS size, ${c('co', 'name')} AS colour,
           SUM(${c('il', 'qty')}) AS units, ${NET} AS net, ${COST} AS cost
    ${SOLD} GROUP BY 1, 2, 3, 4 ORDER BY units DESC, net DESC LIMIT ${Number(limit) || 60}`, w.from, w.to);
  return list.map(r => ({ style: r.style, code: r.code, size: r.size, colour: r.colour, units: num(r.units), net: F(num(r.net)), ...(seeCost ? { profit: F(num(r.net) - num(r.cost)) } : {}) }));
}

/** one point per business date in the window (a shut day is a real zero) — or per hour for a single day */
export async function series(db, user, w) {
  const seeMargin = can(user, 'report.margin');
  if (w.from === w.to) {
    const list = await all(db, `
      SELECT CAST(strftime('%H', ${local(c('i', 'created_at'))}) AS INTEGER) AS k, ${N(NET)} AS net, ${N(COST)} AS cost, COUNT(DISTINCT ${c('i', 'id')}) AS bills
      ${SOLD} GROUP BY 1`, w.from, w.to);
    const by = Object.fromEntries(list.map(r => [r.k, r]));
    return { by: 'hour', points: Array.from({ length: 24 }, (_, h) => ({ k: h, net: F(num(by[h] && by[h].net)), bills: num(by[h] && by[h].bills), ...(seeMargin ? { profit: F(num(by[h] && by[h].net) - num(by[h] && by[h].cost)) } : {}) })) };
  }
  const list = await all(db, `
    SELECT ${c('i', 'business_date')} AS k, ${N(NET)} AS net, ${N(COST)} AS cost, COUNT(DISTINCT ${c('i', 'id')}) AS bills ${SOLD} GROUP BY 1`, w.from, w.to);
  const ro = await all(db, `SELECT ${c('i', 'business_date')} AS k, ${N(`SUM(${pc('i', 'round_off')})`)} AS v FROM ${T('invoices')} i
    WHERE ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')} AND ${c('i', 'business_date')} BETWEEN ?1 AND ?2 GROUP BY 1`, w.from, w.to);
  const by = Object.fromEntries(list.map(r => [r.k, r])), roBy = Object.fromEntries(ro.map(r => [r.k, num(r.v)]));
  const points = [];
  for (let d = w.from; d <= w.to; d = nextDay(d)) {
    const r = by[d] || {}; const net = num(r.net) + (roBy[d] || 0);
    points.push({ k: d, net: F(net), bills: num(r.bills), ...(seeMargin ? { profit: F(net - num(r.cost)) } : {}) });
  }
  return { by: 'day', points };
}
const nextDay = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export async function hours(db, w) {
  const list = await all(db, `SELECT CAST(strftime('%H', ${local(c('i', 'created_at'))}) AS INTEGER) AS hour, COUNT(*) AS bills, ${N(`SUM(${pc('i', 'total')})`)} AS net
    FROM ${T('invoices')} i WHERE ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')} AND ${c('i', 'business_date')} BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY 1`, w.from, w.to);
  return list.map(r => ({ hour: num(r.hour), bills: num(r.bills), net: F(num(r.net)) }));
}

// ── udhaar ──────────────────────────────────────────────────────────────────
const AGE = `CAST(julianday(?1) - julianday(${c('i', 'business_date')}) AS INTEGER)`;
export async function owed(db, today) {
  const r = await first(db, `
    SELECT ${N(`SUM(${pc('i', 'balance_due')})`)} AS total,
           ${N(`SUM(CASE WHEN ${AGE} > 60 THEN ${pc('i', 'balance_due')} ELSE 0 END)`)} AS overdue,
           COUNT(DISTINCT ${c('i', 'customer_id')}) AS customers, MAX(${AGE}) AS oldest_days ${RECEIVABLE}`, today);
  return { total: F(num(r.total)), overdue_60: F(num(r.overdue)), customers: num(r.customers), oldest_days: num(r.oldest_days) };
}
export async function receivables(db, today, showPhones) {
  const list = await all(db, `
    SELECT ${c('cu', 'id')} AS id, ${c('cu', 'name')} AS name, ${c('cu', 'phone')} AS phone, ${c('cu', 'credit_limit')} AS credit_limit,
      ${N(`SUM(CASE WHEN ${AGE} <= 30 THEN ${pc('i', 'balance_due')} ELSE 0 END)`)} AS b0,
      ${N(`SUM(CASE WHEN ${AGE} BETWEEN 31 AND 60 THEN ${pc('i', 'balance_due')} ELSE 0 END)`)} AS b1,
      ${N(`SUM(CASE WHEN ${AGE} BETWEEN 61 AND 90 THEN ${pc('i', 'balance_due')} ELSE 0 END)`)} AS b2,
      ${N(`SUM(CASE WHEN ${AGE} > 90 THEN ${pc('i', 'balance_due')} ELSE 0 END)`)} AS b3,
      ${N(`SUM(${pc('i', 'balance_due')})`)} AS tot, MAX(${AGE}) AS oldest_days, COUNT(*) AS bills
    ${RECEIVABLE} GROUP BY 1, 2, 3, 4 ORDER BY tot DESC`, today);
  const t = { b0: 0, b1: 0, b2: 0, b3: 0, tot: 0 };
  const rows = list.map(r => {
    for (const k of Object.keys(t)) t[k] += num(r[k]);
    return { customer_id: num(r.id), customer: r.name || (showPhones ? r.phone : 'Customer'), phone: showPhones ? r.phone : null, credit_limit: r.credit_limit,
      bills: num(r.bills), oldest_days: num(r.oldest_days), d0_30: F(num(r.b0)), d31_60: F(num(r.b1)), d61_90: F(num(r.b2)), d90_plus: F(num(r.b3)), total: F(num(r.tot)) };
  });
  return { as_on: today, rows, totals: { d0_30: F(t.b0), d31_60: F(t.b1), d61_90: F(t.b2), d90_plus: F(t.b3), total: F(t.tot) } };
}

// ── stock ───────────────────────────────────────────────────────────────────
const STOCK = `FROM ${T('stock_snapshots')} st JOIN ${T('variants')} v ON ${c('v', 'id')} = ${c('st', 'variant_id')} JOIN ${T('styles')} s ON ${c('s', 'id')} = ${c('v', 'style_id')}`;
const Q = c('st', 'qty');
export async function stockValue(db, user) {
  const r = await first(db, `
    SELECT ${N(`SUM(MAX(${Q}, 0))`)} AS pieces, ${N(`SUM(MAX(${Q}, 0) * ${LANDED})`)} AS at_cost,
           ${N(`SUM(MAX(${Q}, 0) * ${RETAIL})`)} AS at_retail, ${N(`SUM(${c('st', 'damaged_qty')})`)} AS damaged
    ${STOCK} WHERE ${Q} > 0 OR ${c('st', 'damaged_qty')} > 0`);
  const rt = await first(db, `SELECT ${N(`SUM(MAX(${Q}, 0))`)} AS pieces, ${N(`SUM(MAX(${Q}, 0) * ${LANDED})`)} AS at_cost, COUNT(*) AS lines
    ${STOCK} WHERE ${Q} > 0 AND (${c('v', 'status')} <> 'ACTIVE' OR ${c('s', 'status')} <> 'ACTIVE')`);
  const margin = can(user, 'report.margin');
  const out = { pieces: num(r.pieces), damaged: num(r.damaged), at_retail: F(num(r.at_retail)), retired: { pieces: num(rt.pieces), lines: num(rt.lines), ...(margin ? { at_cost: F(num(rt.at_cost)) } : {}) } };
  if (margin) out.at_cost = F(num(r.at_cost));
  return out;
}
const LOW_LINE = `MAX(COALESCE(${c('v', 'min_qty')}, 0), COALESCE(${c('s', 'min_qty')}, 0), COALESCE((SELECT CAST(${c('x', 'value')} AS INTEGER) FROM ${T('settings')} x WHERE x.key = 'stock.low_threshold'), 0))`;
export const lowStockCount = db => one(db, `SELECT COUNT(*) AS v ${STOCK} WHERE ${Q} > 0 AND ${Q} <= ${LOW_LINE}`);
export async function stockLists(db, limit = 200) {
  const cat = `JOIN ${T('sizes')} sz ON ${c('sz', 'id')} = ${c('v', 'size_id')} JOIN ${T('colours')} co ON ${c('co', 'id')} = ${c('v', 'colour_id')}`;
  const pick = `${c('s', 'name')} AS style, ${c('s', 'code')} AS code, ${c('sz', 'label')} AS size, ${c('co', 'name')} AS colour, ${c('v', 'sku')} AS sku, ${Q} AS qty`;
  const shape = r => ({ style: r.style, code: r.code, size: r.size, colour: r.colour, sku: r.sku, qty: num(r.qty) });
  const low = await all(db, `SELECT ${pick} ${STOCK} ${cat} WHERE ${Q} > 0 AND ${Q} <= ${LOW_LINE} ORDER BY ${Q}, 1 LIMIT ${limit}`);
  const below = await all(db, `SELECT ${pick} ${STOCK} ${cat} WHERE ${Q} < 0 ORDER BY ${Q} LIMIT ${limit}`);
  const out = await all(db, `SELECT ${pick} ${STOCK} ${cat} WHERE ${Q} = 0 AND ${c('v', 'status')} = 'ACTIVE' AND ${c('s', 'status')} = 'ACTIVE' ORDER BY 1, ${c('sz', 'sort_order')} LIMIT ${limit}`);
  return { low: low.map(shape), below_zero: below.map(shape), out: out.map(shape) };
}

// ── the cash sheet, cash/service.js computeDay ported ───────────────────────
export async function computeDay(db, date) {
  const paisa = (sql, ...args) => one(db, sql, ...args);
  const CM = T('cash_movements'), m = k => c('m', k);
  const netOf = (dir, type) => paisa(`SELECT ${N(`SUM(CASE WHEN ${m('direction')} = '${dir}' THEN ${pc('m', 'amount')} ELSE -${pc('m', 'amount')} END)`)} AS v FROM ${CM} m WHERE ${m('business_date')} = ?1 AND ${m('ref_type')} = ?2`, date, type);
  const cashSales = await paisa(`
    SELECT ${N(`SUM(${pc('p', 'amount')})`)} AS v FROM ${T('payments')} p JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('p', 'invoice_id')}
    WHERE ${c('i', 'business_date')} = ?1 AND NOT ${c('i', 'is_practice')} AND ${c('p', 'method')} = 'CASH'
      AND (${c('i', 'status')} = 'POSTED' OR EXISTS (SELECT 1 FROM ${CM} m WHERE ${m('ref_type')} = 'REFUND' AND ${m('ref_id')} = ${c('i', 'id')}))`, date);
  const returnRefunds = await paisa(`
    SELECT ${N(`SUM(CASE WHEN ${c('r', 'type')} = 'EXCHANGE' THEN MAX(0, -${N(pc('r', 'difference_amount'))}) ELSE ${pc('r', 'refund_amount')} END - ${N(pc('r', 'debt_applied'))})`)} AS v
    FROM ${T('returns')} r WHERE ${c('r', 'business_date')} = ?1 AND ${c('r', 'status')} = 'POSTED' AND ${c('r', 'refund_method')} = 'CASH'`, date);
  const voidRefunds = await netOf('OUT', 'REFUND');
  const voidedCash = await paisa(`SELECT ${N(`SUM(${pc('p', 'amount')})`)} AS v FROM ${T('payments')} p JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('p', 'invoice_id')}
    WHERE ${c('i', 'business_date')} = ?1 AND NOT ${c('i', 'is_practice')} AND ${c('p', 'method')} = 'CASH' AND ${c('i', 'status')} = 'VOID'
      AND EXISTS (SELECT 1 FROM ${CM} m WHERE ${m('ref_type')} = 'REFUND' AND ${m('ref_id')} = ${c('i', 'id')})`, date);
  const openingFloat = await netOf('IN', 'FLOAT');
  const drawerExpenses = await netOf('OUT', 'EXPENSE');
  const commissionPaid = await netOf('OUT', 'COMMISSION');
  const collections = await netOf('IN', 'COLLECTION');
  const advances = await netOf('IN', 'ADVANCE');
  const staffAdvances = await netOf('OUT', 'STAFF_ADVANCE');
  const salariesPaid = await netOf('OUT', 'SALARY');
  const supplierPayments = await netOf('OUT', 'SUPPLIER');
  const bankDeposits = await netOf('OUT', 'BANK');
  const drawings = await netOf('OUT', 'DRAWING');
  const otherNet = await paisa(`SELECT ${N(`SUM(CASE WHEN ${m('direction')} = 'IN' THEN ${pc('m', 'amount')} ELSE -${pc('m', 'amount')} END)`)} AS v FROM ${CM} m
    WHERE ${m('business_date')} = ?1 AND ${m('ref_type')} NOT IN ('FLOAT','EXPENSE','COMMISSION','COLLECTION','SALE','REFUND','ADVANCE','STAFF_ADVANCE','SALARY','SUPPLIER','BANK','DRAWING')`, date);
  const cashRefunds = returnRefunds + voidRefunds;
  const expected = openingFloat + cashSales - cashRefunds - drawerExpenses - commissionPaid + collections + advances
    - staffAdvances - salariesPaid - supplierPayments - bankDeposits - drawings + otherNet;
  const byMethod = (await all(db, `SELECT ${c('p', 'method')} AS method, SUM(${pc('p', 'amount')}) AS v FROM ${T('payments')} p JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('p', 'invoice_id')}
    WHERE ${c('i', 'business_date')} = ?1 AND ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')} GROUP BY 1 ORDER BY 1`, date)).map(r => ({ method: r.method, amount: F(num(r.v)) }));
  return { date, expected: F(expected), opening_float: F(openingFloat), cash_sales: F(cashSales), voided_cash: F(voidedCash), cash_refunds: F(cashRefunds),
    drawer_expenses: F(drawerExpenses), commission_paid: F(commissionPaid), collections: F(collections), advances: F(advances), staff_advances: F(staffAdvances),
    salaries_paid: F(salariesPaid), supplier_payments: F(supplierPayments), bank_deposits: F(bankDeposits), drawings: F(drawings), other_net: F(otherNet), by_method: byMethod };
}
