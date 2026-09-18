// GET /api/sales?period=&from=&to= — the sales report: summary, by method, by category, by salesman, the series, top items
import { guard } from '../_lib/auth.js';
import { query, dayCutoffMs, businessDate, window_ } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('report.sales', async (user, db, context) => {
  const q = query(context.request);
  const w = window_(q, businessDate(await dayCutoffMs(db)));
  const [summary, methods, categories, staff, series, items] = await Promise.all([R.salesSummary(db, user, w), R.byMethod(db, w), R.byCategory(db, user, w), R.bySalesman(db, w), R.series(db, user, w), R.itemWise(db, user, w)]);
  return { summary, methods, categories, staff, series, items };
});
