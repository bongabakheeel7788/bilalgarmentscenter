// GET /api/commission?period=&from=&to= — earned, held, settled per salesman, and the settlements
import { guard } from '../_lib/auth.js';
import { T, c, pc, N, F, num, all, query, dayCutoffMs, businessDate, window_ } from '../_lib/q.js';
export const onRequestGet = guard('comm.view_all', async (user, db, context) => {
  const q = query(context.request);
  const w = window_({ period: q.period || 'This Month', from: q.from, to: q.to }, businessDate(await dayCutoffMs(db)));
  const rows = (await all(db, `SELECT ${c('u', 'id')} AS id, ${c('u', 'name')} AS name,
      ${N(`SUM(CASE WHEN ${c('e', 'business_date')} BETWEEN ?1 AND ?2 THEN ${pc('e', 'amount')} ELSE 0 END)`)} AS in_window,
      ${N(`SUM(CASE WHEN ${c('e', 'business_date')} BETWEEN ?1 AND ?2 AND ${c('e', 'hold_state')} = 'HELD' THEN ${pc('e', 'amount')} ELSE 0 END)`)} AS held,
      ${N(`SUM(CASE WHEN ${c('e', 'settlement_id')} IS NULL AND COALESCE(${c('e', 'hold_state')}, '') <> 'HELD' THEN ${pc('e', 'amount')} ELSE 0 END)`)} AS unsettled
    FROM ${T('users')} u JOIN ${T('commission_entries')} e ON ${c('e', 'salesperson_id')} = ${c('u', 'id')} GROUP BY 1, 2 ORDER BY in_window DESC`, w.from, w.to))
    .map(r => ({ id: num(r.id), name: r.name, earned: F(num(r.in_window)), held: F(num(r.held)), unsettled: F(num(r.unsettled)) }));
  const settlements = (await all(db, `SELECT s.data AS d, ${c('u', 'name')} AS name, ${c('b', 'name')} AS by FROM ${T('commission_settlements')} s LEFT JOIN ${T('users')} u ON ${c('u', 'id')} = ${c('s', 'salesperson_id')} LEFT JOIN ${T('users')} b ON ${c('b', 'id')} = ${c('s', 'settled_by')}
    WHERE ${c('s', 'business_date')} BETWEEN ?1 AND ?2 ORDER BY ${c('s', 'id')} DESC LIMIT 200`, w.from, w.to)).map(x => { const s = JSON.parse(x.d); return { name: x.name, business_date: s.business_date, amount: s.amount, direction: s.direction, note: s.note, by: x.by }; });
  return { ...w, rows, settlements };
});
