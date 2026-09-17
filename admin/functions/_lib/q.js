// P93 — the portal's arithmetic toolbox. Every mirrored row is a JSON document
// (P92), so a column is json_extract(alias.data, '$.col'); money in it is the
// NUMERIC text the POS holds ('2400.00'). Rule 5 on the portal: an aggregate
// is a SUM of INTEGER PAISA — CAST(ROUND(x*100) AS INTEGER) per row, never a
// float sum — and the rupee string is made at the edge, the same way
// server/lib/money.js does it.
import { TABLE } from './db.js';
import { err } from './auth.js';
export { err };

export const T = TABLE;
/** json_extract for alias.col */
export const c = (alias, col) => `json_extract(${alias}.data, '$.${col}')`;
/** the paisa of a NUMERIC text column (or an expression over one) */
export const P = expr => `CAST(ROUND(CAST(${expr} AS REAL) * 100) AS INTEGER)`;
export const pc = (alias, col) => P(c(alias, col));
export const N = expr => `COALESCE(${expr}, 0)`;

/** integer paisa → 'Rs' string with two decimals — money.fromPaisa, ported */
export function F(paisa) {
  const n = Math.trunc(Number(paisa) || 0);
  const neg = n < 0, a = Math.abs(n);
  return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
}
export const toPaisa = s => { const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(s || '0').trim()); if (!m) return 0; return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] || '0').padEnd(2, '0'))); };
export const pct = (num, den) => den ? Math.round(num / den * 1000) / 10 : 0;
export const change = (now, before) => { const a = Number(now), b = Number(before); return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null; };

// ── the business date, the POS's way (server/lib/period.js) ────────────────
// Karachi is UTC+5 with no daylight time; the day ends at shop.day_ends_at
// (default 04:00), read from the mirrored settings.
export const PERIODS = ['Today', 'Yesterday', 'Last 7 Days', 'Last Week', 'This Month', 'Last 30 Days', 'This Year', 'Last Year', 'Custom'];
const KARACHI_MS = 5 * 3600e3;
export async function dayCutoffMs(db) {
  const r = await db.prepare(`SELECT ${c('s', 'value')} AS v FROM ${T('settings')} s WHERE key = 'shop.day_ends_at'`).first().catch(() => null);
  const m = /^"?(\d{2}):(\d{2})"?$/.exec(String(r && r.v || '04:00'));
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 60e3 : 4 * 3600e3;
}
export const businessDate = (cutoffMs, d = new Date()) => new Date(d.getTime() - cutoffMs + KARACHI_MS).toISOString().slice(0, 10);
export const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = ymd => (new Date(ymd + 'T00:00:00Z').getUTCDay() + 6) % 7;      // Monday = 0
const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && addDays(d, 0) === d;

/** { period, from, to } inclusive business dates — reports/service.js window_() ported, with its guards */
export function window_(q, today) {
  const name = q.period || 'Today';
  if (!PERIODS.includes(name)) throw err(400, 'BAD_PERIOD', `Pick one of: ${PERIODS.join(', ')}.`);
  const y = today.slice(0, 4), m = today.slice(0, 7);
  let r;
  switch (name) {
    case 'Today': r = { from: today, to: today }; break;
    case 'Yesterday': { const d = addDays(today, -1); r = { from: d, to: d }; break; }
    case 'Last 7 Days': r = { from: addDays(today, -6), to: today }; break;
    case 'Last Week': { const mon = addDays(today, -dow(today) - 7); r = { from: mon, to: addDays(mon, 6) }; break; }
    case 'This Month': r = { from: m + '-01', to: today }; break;
    case 'Last 30 Days': r = { from: addDays(today, -29), to: today }; break;
    case 'This Year': r = { from: y + '-01-01', to: today }; break;
    case 'Last Year': { const ly = String(Number(y) - 1); r = { from: ly + '-01-01', to: ly + '-12-31' }; break; }
    default:
      if (!okDate(q.from) || !okDate(q.to)) throw err(400, 'BAD_DATE', 'Pick both dates for a custom period (YYYY-MM-DD).');
      if (q.from > q.to) throw err(400, 'BAD_RANGE', 'The "from" date is after the "to" date — swap them.');
      if (q.from < addDays(q.to, -(3 * 366))) throw err(400, 'BAD_RANGE', 'A custom period can cover at most three years.');
      r = { from: q.from, to: q.to };
  }
  return { period: name, ...r };
}
/** the same length of time immediately before — reports/service.js previous() */
export function previous(w) {
  const days = Math.round((Date.parse(w.to + 'T00:00:00Z') - Date.parse(w.from + 'T00:00:00Z')) / 86400000) + 1;
  return { period: 'Custom', from: addDays(w.from, -days), to: addDays(w.to, -days), days };
}
/** a Karachi wall-clock expression over an ISO UTC timestamp column */
export const local = expr => `datetime(${expr}, '+5 hours')`;
/** the query string as an object */
export const query = request => Object.fromEntries(new URL(request.url).searchParams.entries());
export const first = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {};
export const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
export const num = v => Number(v) || 0;

// ── the shared spines, ported from reports/service.js ───────────────────────
/** sold lines in [from,to]: POSTED, not practice, LEFT-joined to the catalogue (P65: a bill-only line is real money) */
export const SOLD = `
  FROM ${T('invoice_lines')} il
  JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('il', 'invoice_id')} AND ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')}
  LEFT JOIN ${T('variants')} v ON ${c('v', 'id')} = ${c('il', 'variant_id')}
  LEFT JOIN ${T('styles')} s ON ${c('s', 'id')} = ${c('v', 'style_id')}
  LEFT JOIN ${T('sizes')} sz ON ${c('sz', 'id')} = ${c('v', 'size_id')}
  LEFT JOIN ${T('colours')} co ON ${c('co', 'id')} = ${c('v', 'colour_id')}
  LEFT JOIN ${T('categories')} ca ON ${c('ca', 'id')} = ${c('s', 'category_id')}
  LEFT JOIN ${T('categories')} pc ON ${c('pc', 'id')} = ${c('ca', 'parent_id')}
  WHERE ${c('i', 'business_date')} BETWEEN ?1 AND ?2`;
export const NET = `SUM(${pc('il', 'line_total')})`;
export const COST = `SUM(${pc('il', 'cost_at_sale')} * ${c('il', 'qty')})`;
/** P34 H16 — the bill rounds after the lines are priced; Σ lines + round-off = the bills */
export const ROUND_OFF = `SELECT ${N(`SUM(${pc('i', 'round_off')})`)} AS v FROM ${T('invoices')} i
  WHERE ${c('i', 'status')} = 'POSTED' AND NOT ${c('i', 'is_practice')} AND ${c('i', 'business_date')} BETWEEN ?1 AND ?2`;
/** the receivable: a bill not voided, not practice, with money still due */
export const RECEIVABLE = `FROM ${T('invoices')} i JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('i', 'customer_id')}
  WHERE ${c('i', 'status')} <> 'VOID' AND NOT ${c('i', 'is_practice')} AND CAST(${c('i', 'balance_due')} AS REAL) > 0`;
/** landed cost of a variant: the ledger's average, else the size's own price, else the style's (P88.1) */
export const LANDED = `COALESCE(NULLIF(${pc('st', 'avg_cost')}, 0), ${pc('v', 'purchase_price_override')}, ${pc('s', 'purchase_price')})`;
export const RETAIL = `COALESCE(${pc('v', 'selling_price_override')}, ${pc('s', 'selling_price')})`;
