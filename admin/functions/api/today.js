// GET /api/today — the shop right now: sales, cash, udhaar, stock, what needs a call (P93 §2)
import { guard, can } from '../_lib/auth.js';
import { T, c, pc, N, F, num, first, all, dayCutoffMs, businessDate, window_ } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('report.sales', async (user, db) => {
  const today = businessDate(await dayCutoffMs(db));
  const w = window_({ period: 'Today' }, today);
  const sales = await R.salesSummary(db, user, w);
  const byCat = await all(db, `SELECT ${c('e', 'category')} AS category, ${N(`SUM(${pc('e', 'amount')})`)} AS v FROM ${T('expenses')} e
    WHERE ${c('e', 'business_date')} BETWEEN ?1 AND ?2 AND ${c('e', 'status')} = 'POSTED' GROUP BY 1`, w.from, w.to);
  const isBadDebt = x => /^bad debt$/i.test(x || ''), isAbsorbed = x => /^commission absorbed$/i.test(x || ''), isDrawing = x => /^personal draw$|owner'?s? draw/i.test(String(x || '').trim());
  const expenses = byCat.filter(e => !isBadDebt(e.category) && !isAbsorbed(e.category) && !isDrawing(e.category)).reduce((a, e) => a + num(e.v), 0);
  const badDebt = byCat.filter(e => isBadDebt(e.category)).reduce((a, e) => a + num(e.v), 0);
  const out = { today, sales: { net: sales.net, bills: sales.bills, units: sales.units, refunds: sales.refunds, average_basket: sales.average_basket, ...(sales.profit !== undefined ? { profit: sales.profit, margin_pct: sales.margin_pct } : {}), expenses: F(expenses), bad_debt: F(badDebt), change: sales.change, before: sales.before },
    methods: await R.byMethod(db, w), hours: await R.hours(db, w), staff: (await R.bySalesman(db, w)).slice(0, 8) };
  const shift = await first(db, `SELECT ${c('s', 'business_date')} AS opened_on, ${c('s', 'opened_at')} AS opened_at, ${c('s', 'opening_float')} AS opening_float, ${c('u', 'name')} AS by
    FROM ${T('shifts')} s LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('s', 'user_id')} WHERE ${c('s', 'status')} = 'OPEN' ORDER BY ${c('s', 'opened_at')} DESC LIMIT 1`);
  out.shift = shift.opened_at ? { opened_on: shift.opened_on, opened_at: shift.opened_at, opening_float: shift.opening_float, by: shift.by,
    days_open: Math.round((Date.parse(today) - Date.parse(shift.opened_on)) / 86400000) } : null;
  if (can(user, 'cash.move')) { const d = await R.computeDay(db, today); out.cash = { expected_now: d.expected, cash_sales: d.cash_sales, drawer_expenses: d.drawer_expenses, collections: d.collections }; }
  if (can(user, 'credit.view')) out.receivables = await R.owed(db, today);
  if (can(user, 'report.stock')) {
    const sv = await R.stockValue(db, user);
    out.stock = { pieces: sv.pieces, retired: sv.retired, low_count: await R.lowStockCount(db), below_zero_count: num((await first(db, `SELECT COUNT(*) AS v FROM ${T('stock_snapshots')} st WHERE ${c('st', 'qty')} < 0`)).v),
      ...(sv.at_cost !== undefined ? { value_at_cost: sv.at_cost } : { value_at_retail: sv.at_retail }) };
  }
  if (can(user, 'orders.view')) {
    const n = await first(db, `SELECT
      SUM(CASE WHEN ${c('o', 'status')} = 'NEW' AND ${c('o', 'placed_at')} < ?1 THEN 1 ELSE 0 END) AS uncalled,
      SUM(CASE WHEN ${c('o', 'status')} IN ('DISPATCHED','AT_STATION','OUT_FOR_DELIVERY','ON_HOLD') AND ${c('o', 'stage_at')} < ?2 THEN 1 ELSE 0 END) AS stuck,
      SUM(CASE WHEN ${c('o', 'status')} IN ('RETURN_STARTED','RETURN_BOOKED','RETURN_SHIPPED') AND ${c('o', 'stage_at')} < ?3 THEN 1 ELSE 0 END) AS stuck_back,
      SUM(CASE WHEN ${c('o', 'status')} = 'RETURN_RECEIVED' THEN 1 ELSE 0 END) AS to_check,
      SUM(CASE WHEN ${c('o', 'status')} = 'NEW' THEN 1 ELSE 0 END) AS new_orders
      FROM ${T('online_orders')} o`, ago(1), ago(5), ago(8));
    const a = [];
    if (num(n.uncalled)) a.push(`${n.uncalled} order${n.uncalled == 1 ? '' : 's'} nobody has called yet`);
    if (num(n.stuck)) a.push(`${n.stuck} parcel${n.stuck == 1 ? '' : 's'} stuck with the courier`);
    if (num(n.stuck_back)) a.push(`${n.stuck_back} return${n.stuck_back == 1 ? '' : 's'} the courier has not sent back`);
    if (num(n.to_check)) a.push(`${n.to_check} parcel${n.to_check == 1 ? '' : 's'} back with us, waiting to be opened`);
    out.orders = { new_orders: num(n.new_orders), attention: a };
  }
  return out;
});
const ago = days => new Date(Date.now() - days * 86400e3).toISOString();
