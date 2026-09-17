// GET /api/staff?month=YYYY-MM — attendance by person for a month; advances and salaries with staff.pay.view
import { guard, can } from '../_lib/auth.js';
import { T, c, pc, N, F, num, all, query, dayCutoffMs, businessDate } from '../_lib/q.js';
export const onRequestGet = guard('attendance.view_all', async (user, db, context) => {
  const q = query(context.request);
  const today = businessDate(await dayCutoffMs(db));
  const month = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : today.slice(0, 7);
  const from = month + '-01', to = month + '-31';
  const people = (await all(db, `SELECT ${c('u', 'id')} AS id, ${c('u', 'name')} AS name, ${c('r', 'name')} AS role, ${c('u', 'status')} AS status,
      (SELECT COUNT(*) FROM ${T('staff_attendance')} a WHERE ${c('a', 'user_id')} = ${c('u', 'id')} AND ${c('a', 'business_date')} BETWEEN ?1 AND ?2) AS days,
      (SELECT ${N(`SUM(CAST(${c('a', 'hours')} AS REAL))`)} FROM ${T('staff_attendance')} a WHERE ${c('a', 'user_id')} = ${c('u', 'id')} AND ${c('a', 'business_date')} BETWEEN ?1 AND ?2) AS hours,
      (SELECT MAX(${c('a', 'punch_in')}) FROM ${T('staff_attendance')} a WHERE ${c('a', 'user_id')} = ${c('u', 'id')}) AS last_in
    FROM ${T('users')} u LEFT JOIN ${T('roles')} r ON ${c('r', 'id')} = ${c('u', 'primary_role_id')} WHERE ${c('u', 'status')} <> 'SYSTEM' ORDER BY ${c('u', 'name')}`, from, to))
    .map(r => ({ id: num(r.id), name: r.name, role: r.role, status: r.status, days: num(r.days), hours: Math.round(num(r.hours) * 10) / 10, last_in: r.last_in }));
  const attendance = (await all(db, `SELECT a.data AS d, ${c('u', 'name')} AS name FROM ${T('staff_attendance')} a LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('a', 'user_id')}
    WHERE ${c('a', 'business_date')} BETWEEN ?1 AND ?2 ORDER BY ${c('a', 'business_date')} DESC, ${c('a', 'punch_in')} LIMIT 400`, from, to)).map(x => { const a = JSON.parse(x.d); return { name: x.name, business_date: a.business_date, punch_in: a.punch_in, punch_out: a.punch_out, break_minutes: a.break_minutes, hours: a.hours, source: a.source }; });
  const out = { month, people, attendance };
  if (can(user, 'staff.pay.view')) {
    out.advances = (await all(db, `SELECT a.data AS d, ${c('u', 'name')} AS name FROM ${T('staff_advances')} a LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('a', 'user_id')} ORDER BY ${c('a', 'id')} DESC LIMIT 100`)).map(x => { const a = JSON.parse(x.d); return { name: x.name, advance_date: a.advance_date, amount: a.amount, note: a.note, settled: !!a.settled, settled_at: a.settled_at }; });
    out.salaries = (await all(db, `SELECT s.data AS d, ${c('u', 'name')} AS name FROM ${T('salary_records')} s LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('s', 'user_id')} ORDER BY ${c('s', 'period_month')} DESC, ${c('s', 'id')} DESC LIMIT 100`)).map(x => { const s = JSON.parse(x.d); return { name: x.name, period_month: s.period_month, gross: s.gross, advances_deducted: s.advances_deducted, absence_deduction: s.absence_deduction, net: s.net, paid_at: s.paid_at, present_days: s.present_days, absence_days: s.absence_days }; });
  }
  return out;
});
