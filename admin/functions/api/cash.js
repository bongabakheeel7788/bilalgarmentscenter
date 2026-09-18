// GET /api/cash?date= — the cash sheet for a day, the shifts, the closes, every movement and expense
import { guard } from '../_lib/auth.js';
import { T, c, num, all, query, dayCutoffMs, businessDate, addDays } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('cash.move', async (user, db, context) => {
  const q = query(context.request);
  const today = businessDate(await dayCutoffMs(db));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : today;
  const [day, shiftRows, closeRows, movRows, expRows] = await Promise.all([R.computeDay(db, date), all(db, `SELECT s.data AS d, ${c('u', 'name')} AS by FROM ${T('shifts')} s LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('s', 'user_id')}
    WHERE ${c('s', 'business_date')} BETWEEN ?1 AND ?2 OR ${c('s', 'status')} = 'OPEN' ORDER BY ${c('s', 'id')} DESC LIMIT 40`, addDays(date, -14), date),
    all(db, `SELECT dc.data AS d, ${c('u', 'name')} AS by FROM ${T('day_closes')} dc LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('dc', 'locked_by')} ORDER BY ${c('dc', 'business_date')} DESC LIMIT 31`),
    all(db, `SELECT m.data AS d, ${c('u', 'name')} AS by FROM ${T('cash_movements')} m LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('m', 'user_id')} WHERE ${c('m', 'business_date')} = ?1 ORDER BY ${c('m', 'id')}`, date),
    all(db, `SELECT e.data AS d, ${c('u', 'name')} AS by FROM ${T('expenses')} e LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('e', 'entered_by')} WHERE ${c('e', 'business_date')} = ?1 ORDER BY ${c('e', 'id')}`, date)]);
  const shifts = shiftRows.map(x => { const s = JSON.parse(x.d); return { id: s.id, by: x.by, business_date: s.business_date, opened_at: s.opened_at, closed_at: s.closed_at, opening_float: s.opening_float, declared_cash: s.declared_cash, expected_cash: s.expected_cash, variance: s.variance, variance_reason: s.variance_reason, status: s.status }; });
  const closes = closeRows.map(x => { const d = JSON.parse(x.d); const s = d.summary || {}; const nc = !!(d.not_counted || s.not_counted); return { business_date: d.business_date, locked_at: d.locked_at, by: x.by, reopened_at: d.reopened_at, expected: s.expected, declared: nc ? null : s.declared, variance: nc ? null : s.variance, float_left: s.float_left, closed_with: s.closed_with, days: s.days ? s.days.length : undefined, not_counted: nc, auto_closed: !!s.auto_closed }; });
  const movements = movRows.map(x => { const m = JSON.parse(x.d); return { at: m.created_at, direction: m.direction, amount: m.amount, ref_type: m.ref_type, reason: m.reason, by: x.by }; });
  const expenses = expRows.map(x => { const e = JSON.parse(x.d); return { at: e.created_at, category: e.category, amount: e.amount, method: e.method, description: e.description, paid_from_drawer: !!e.paid_from_drawer, status: e.status, by: x.by }; });
  return { date, today, day, shifts, closes, movements, expenses };
});
