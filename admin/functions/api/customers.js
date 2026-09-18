// GET /api/customers — udhaar: who owes what and for how long, the lapsed list, recent collections and write-offs
import { guard, can } from '../_lib/auth.js';
import { T, c, pc, num, all, first, dayCutoffMs, businessDate, toPaisa, F } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('credit.view', async (user, db) => {
  const today = businessDate(await dayCutoffMs(db));
  const phones = can(user, 'pos.history.all');
  const [rec, owedNow, lapsedRow, lastPaid, collections, writeoffs] = await Promise.all([
    R.receivables(db, today, phones), R.owed(db, today),
    first(db, `SELECT ${c('s', 'value')} AS v FROM ${T('settings')} s WHERE key = 'credit.lapsed_days'`),
    all(db, `SELECT ${c('cc', 'customer_id')} AS id, MAX(${c('cc', 'business_date')}) AS d FROM ${T('credit_collections')} cc WHERE ${c('cc', 'status')} = 'POSTED' GROUP BY 1`),
    all(db, `SELECT cc.data AS d, ${c('cu', 'name')} AS customer, ${c('cu', 'phone')} AS phone, ${c('u', 'name')} AS received_by
      FROM ${T('credit_collections')} cc LEFT JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('cc', 'customer_id')} LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('cc', 'received_by')}
      ORDER BY ${c('cc', 'id')} DESC LIMIT 100`),
    all(db, `SELECT w.data AS d, ${c('cu', 'name')} AS customer, ${c('i', 'invoice_no')} AS invoice_no, ${c('u', 'name')} AS approved_by
      FROM ${T('bad_debt_writeoffs')} w LEFT JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('w', 'customer_id')} LEFT JOIN ${T('invoices')} i ON ${c('i', 'id')} = ${c('w', 'invoice_id')} LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('w', 'approved_by')}
      ORDER BY ${c('w', 'id')} DESC LIMIT 100`),
  ]);
  const lapsedDays = num(lapsedRow.v) || 60;
  const lastBy = Object.fromEntries(lastPaid.map(r => [num(r.id), r.d]));
  const lapsed = [];
  for (const r of rec.rows) {
    const d = lastBy[r.customer_id];
    const since = d ? Math.round((Date.parse(today) - Date.parse(String(d).slice(0, 10))) / 86400000) : r.oldest_days;
    if (since >= lapsedDays) lapsed.push({ customer_id: r.customer_id, customer: r.customer, phone: r.phone, balance: r.total, oldest_days: r.oldest_days, last_paid: d || null, days_since_payment: since });
  }
  const shapedCollections = collections.map(x => { const t = JSON.parse(x.d); return { collection_no: t.collection_no, business_date: t.business_date, amount: t.amount, method: t.method, status: t.status, customer: x.customer || (phones ? x.phone : 'Customer'), phone: phones ? x.phone : null, received_by: x.received_by }; });
  const shapedWriteoffs = writeoffs.map(x => { const t = JSON.parse(x.d); return { at: t.created_at, amount: t.amount, kind: t.kind, reason: t.reason, customer: x.customer, invoice_no: x.invoice_no, approved_by: x.approved_by }; });
  return { as_on: today, owed: owedNow, receivables: rec, lapsed: { after_days: lapsedDays, rows: lapsed, total: F(lapsed.reduce((a, r) => a + toPaisa(r.balance), 0)) }, collections: shapedCollections, writeoffs: shapedWriteoffs };
});
