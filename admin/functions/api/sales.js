// GET /api/sales?period=&from=&to= — the sales report: summary, by method, by category, by salesman, the series, top items
import { guard } from '../_lib/auth.js';
import { query, dayCutoffMs, businessDate, window_ } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('report.sales', async (user, db, context) => {
  const q = query(context.request);
  const w = window_(q, businessDate(await dayCutoffMs(db)));
  return { summary: await R.salesSummary(db, user, w), methods: await R.byMethod(db, w), categories: await R.byCategory(db, user, w),
    staff: await R.bySalesman(db, w), series: await R.series(db, user, w), items: await R.itemWise(db, user, w) };
});
