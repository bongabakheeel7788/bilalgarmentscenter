// GET /api/traffic — P101, the website's traffic and what it turned into.
// Reads BOTH databases: the visit log in ORDERS, the orders' final fate in DB.
import { guard } from '../_lib/auth.js';
import { query, dayCutoffMs, businessDate, window_, err } from '../_lib/q.js';
import { traffic } from '../_lib/traffic.js';

export const onRequestGet = guard('report.sales', async (user, db, context) => {
  const orders = context.env.ORDERS;
  if (!orders) throw err(503, 'NO_VISIT_LOG', 'The visit log database is not bound to this portal yet (ORDERS → bgc-orders on the Pages project).');
  const today = businessDate(await dayCutoffMs(db));
  return traffic(db, orders, window_(query(context.request), today));
});
