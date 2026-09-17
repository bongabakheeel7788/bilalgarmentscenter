// GET /api/customers — udhaar: who owes what and for how long, the lapsed list, recent collections and write-offs
import { guard, can } from '../_lib/auth.js';
import { T, c, pc, num, all, first, dayCutoffMs, businessDate, toPaisa, F } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('credit.view', async (user, db) => {
  const today = businessDate(await dayCutoffMs(db));
  const phones = can(user, 'pos.history.all');
  const rec = await R.receivables(db, today, phones);
  const lapsedDays = num((await first(db, `SELECT ${c('s', 'value')} AS v FROM ${T('settings')} s WHERE key = 'credit.lapsed_days'`)).v) || 60;
  const lapsed = [];
  for (const r of rec.rows) {
    const lp = await first(db, `SELECT MAX(${c('cc', 'business_date')}) AS d FROM ${T('credit_collections')} cc WHERE ${c('cc', 'customer_id')} = ?1 AND ${c('cc', 'status')} = 'POSTED'`, r.customer_id);
    const since = lp.d ? Math.round((Date.parse(today) - Date.parse(String(lp.d).slice(0, 10))) / 86400000) : r.oldest_days;
    if (since >= lapsedDays) lapsed.push({ customer_id: r.customer_id, customer: r.customer, phone: r.phone, balance: r.total, oldest_days: r.oldest_days, last_paid: lp.d || null, days_since_payment: since });
  }
  const collections = (await all(db, `SELECT cc.data AS d, ${c('cu', 'name')} AS customer, ${c('cu', 'phone')} AS phone, ${c('u', 'name')} AS received_by
    FROM ${T('credit_collections')} cc LEFT JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('cc', 'customer_id')} LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('cc', 'received_by')}
    ORDER BY ${c('cc', 'id')} DESC LIMIT 100`)).map(x => { const t = JSON.parse(x.d); return { collection_no: t.collection_no, business_date: t.business_date, amount: t.amount, method: t.method, status: t.status, customer: x.customer || (phones ? x.phone : 'Customer'), phone: phones ? x.phone : null, received_by: x.received_by }; });
  const writeoffs = (await all(db, `SELECT w.data AS d, ${c('cu', 'name')} AS customer, ${c('i', 'invoice_no')} AS invoice_no, ${c('u', 'name')} AS approved_by
    FROM ${T('bad_debt_writeoffs')} w LEFT JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('w', 'customer_id')} LEFT JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('w', 'invoice_id')} LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('w', 'approved_by')}
    ORDER BY ${c('w', 'id')} DESC LIMIT 100`)).map(x => { const t = JSON.parse(x.d); return { at: t.created_at, amount: t.amount, kind: t.kind, reason: t.reason, customer: x.customer, invoice_no: x.invoice_no, approved_by: x.approved_by }; });
  return { as_on: today, owed: await R.owed(db, today), receivables: rec, lapsed: { after_days: lapsedDays, rows: lapsed, total: F(lapsed.reduce((a, r) => a + toPaisa(r.balance), 0)) }, collections, writeoffs };
});
