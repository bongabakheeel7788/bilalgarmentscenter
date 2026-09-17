// GET /api/stock — levels: low, out, below zero; the value (at cost only with report.margin); by category
import { guard, can } from '../_lib/auth.js';
import { T, c, N, F, num, all, LANDED, RETAIL } from '../_lib/q.js';
import * as R from '../_lib/reports.js';
export const onRequestGet = guard('report.stock', async (user, db) => {
  const margin = can(user, 'report.margin');
  const byCat = await all(db, `
    SELECT COALESCE(${c('pc', 'name')} || ' › ' || ${c('ca', 'name')}, ${c('ca', 'name')}, 'Uncategorised') AS label,
           ${N(`SUM(MAX(${c('st', 'qty')}, 0))`)} AS pieces, COUNT(DISTINCT ${c('s', 'id')}) AS styles,
           ${N(`SUM(MAX(${c('st', 'qty')}, 0) * ${LANDED})`)} AS at_cost, ${N(`SUM(MAX(${c('st', 'qty')}, 0) * ${RETAIL})`)} AS at_retail
    FROM ${T('stock_snapshots')} st JOIN ${T('variants')} v ON ${c('v', 'id')} = ${c('st', 'variant_id')} JOIN ${T('styles')} s ON ${c('s', 'id')} = ${c('v', 'style_id')}
    LEFT JOIN ${T('categories')} ca ON ${c('ca', 'id')} = ${c('s', 'category_id')} LEFT JOIN ${T('categories')} pc ON ${c('pc', 'id')} = ${c('ca', 'parent_id')}
    WHERE ${c('st', 'qty')} > 0 GROUP BY 1 ORDER BY pieces DESC`);
  return { value: await R.stockValue(db, user), lists: await R.stockLists(db),
    categories: byCat.map(r => ({ label: r.label, pieces: num(r.pieces), styles: num(r.styles), at_retail: F(num(r.at_retail)), ...(margin ? { at_cost: F(num(r.at_cost)) } : {}) })) };
});
