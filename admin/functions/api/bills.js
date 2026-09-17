// GET /api/bills?q=&from=&to=&page= — search by bill number, phone, customer, amount; newest first
import { guard, can } from '../_lib/auth.js';
import { T, c, pc, F, num, all, first, query, dayCutoffMs, businessDate, addDays } from '../_lib/q.js';
const PAGE = 50;
export const onRequestGet = guard('pos.history.all', async (user, db, context) => {
  const q = query(context.request);
  const today = businessDate(await dayCutoffMs(db));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : addDays(today, -30), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : today;
  const page = Math.max(0, Number(q.page) || 0);
  const term = String(q.q || '').trim();
  const where = [`${c('i', 'business_date')} BETWEEN ?1 AND ?2`, `NOT ${c('i', 'is_practice')}`];
  const args = [from, to];
  if (term) {
    args.push(`%${term}%`, term);
    const n = args.length - 1, m = args.length;
    where.push(`(${c('i', 'invoice_no')} LIKE ?${n} OR ${c('cu', 'name')} LIKE ?${n} OR ${c('cu', 'phone')} LIKE ?${n} OR CAST(${c('i', 'total')} AS TEXT) = ?${m} OR CAST(CAST(${c('i', 'total')} AS INTEGER) AS TEXT) = ?${m})`);
  }
  if (term && !q.from) { where[0] = '1'; }        // a search by number or phone is not bounded by the month
  const base = `FROM ${T('invoices')} i LEFT JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('i', 'customer_id')}
    LEFT JOIN ${T('users')} sp ON ${c('sp', 'id')} = ${c('i', 'salesperson_id')} WHERE ${where.join(' AND ')}`;
  const total = num((await first(db, `SELECT COUNT(*) AS v ${base}`, ...args)).v);
  const rows = await all(db, `SELECT ${c('i', 'id')} AS id, ${c('i', 'invoice_no')} AS invoice_no, ${c('i', 'business_date')} AS business_date, ${c('i', 'created_at')} AS created_at,
      ${c('i', 'status')} AS status, ${c('i', 'payment_status')} AS payment_status, ${c('i', 'total')} AS total, ${c('i', 'balance_due')} AS balance_due, ${c('i', 'channel')} AS channel,
      ${c('cu', 'name')} AS customer, ${c('cu', 'phone')} AS phone, ${c('sp', 'name')} AS salesman,
      (SELECT SUM(${c('il', 'qty')}) FROM ${T('invoice_lines')} il WHERE ${c('il', 'invoice_id')} = ${c('i', 'id')}) AS units
    ${base} ORDER BY ${c('i', 'id')} DESC LIMIT ${PAGE} OFFSET ${page * PAGE}`, ...args);
  return { from, to, q: term, page, total, page_size: PAGE, rows: rows.map(r => ({ ...r, id: num(r.id), units: num(r.units), phone: r.phone })) };
});
