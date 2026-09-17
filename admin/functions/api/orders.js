// GET /api/orders?status= — the website's orders as the shop sees them (no address in the list; phones with pos.history.all)
import { guard, can } from '../_lib/auth.js';
import { T, c, num, all, query } from '../_lib/q.js';
export const onRequestGet = guard('orders.view', async (user, db, context) => {
  const q = query(context.request), phones = can(user, 'pos.history.all');
  const counts = Object.fromEntries((await all(db, `SELECT ${c('o', 'status')} AS s, COUNT(*) AS n FROM ${T('online_orders')} o GROUP BY 1`)).map(r => [r.s, num(r.n)]));
  const where = q.status ? `WHERE ${c('o', 'status')} = ?1` : '';
  const rows = (await all(db, `SELECT o.data AS d, ${c('a', 'name')} AS agent FROM ${T('online_orders')} o LEFT JOIN ${T('users')} a ON ${c('a', 'id')} = ${c('o', 'agent_id')} ${where} ORDER BY ${c('o', 'placed_at')} DESC LIMIT 200`, ...(q.status ? [q.status] : [])))
    .map(x => { const o = JSON.parse(x.d); return { id: o.id, order_no: o.order_no, status: o.status, delivery: o.delivery, name: o.name, phone: phones ? o.phone : null, city: o.city, total: o.total, delivery_charge: o.delivery_charge, placed_at: o.placed_at, dispatched_at: o.dispatched_at, delivered_at: o.delivered_at, courier: o.courier, tracking_no: o.tracking_no, agent: x.agent, campaign: o.campaign, cancel_reason: o.cancel_reason }; });
  return { counts, status: q.status || null, rows };
});
