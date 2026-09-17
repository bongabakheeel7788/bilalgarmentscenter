// GET /api/products?q=&page= — the catalogue: every style with its stock and price; cost with catalog.view_cost
import { guard, can } from '../_lib/auth.js';
import { T, c, num, all, first, query } from '../_lib/q.js';
const PAGE = 60;
export const onRequestGet = guard('catalog.view', async (user, db, context) => {
  const q = query(context.request), term = String(q.q || '').trim(), page = Math.max(0, Number(q.page) || 0);
  const seeCost = can(user, 'catalog.view_cost');
  const where = [`${c('s', 'status')} <> 'PURGED'`, `NOT COALESCE(${c('s', 'is_practice')}, 0)`];
  const args = [];
  if (term) { args.push(`%${term}%`); where.push(`(${c('s', 'name')} LIKE ?1 OR ${c('s', 'code')} LIKE ?1 OR ${c('ca', 'name')} LIKE ?1 OR EXISTS (SELECT 1 FROM ${T('variants')} vx JOIN ${T('barcodes')} b ON ${c('b', 'variant_id')} = ${c('vx', 'id')} WHERE ${c('vx', 'style_id')} = ${c('s', 'id')} AND (${c('b', 'code')} LIKE ?1 OR ${c('vx', 'sku')} LIKE ?1)))`); }
  if (q.status === 'ACTIVE') where.push(`${c('s', 'status')} = 'ACTIVE'`);
  const base = `FROM ${T('styles')} s LEFT JOIN ${T('categories')} ca ON ${c('ca', 'id')} = ${c('s', 'category_id')} LEFT JOIN ${T('categories')} pc ON ${c('pc', 'id')} = ${c('ca', 'parent_id')} WHERE ${where.join(' AND ')}`;
  const total = num((await first(db, `SELECT COUNT(*) AS v ${base}`, ...args)).v);
  const rows = await all(db, `SELECT ${c('s', 'id')} AS id, ${c('s', 'code')} AS code, ${c('s', 'name')} AS name, ${c('s', 'status')} AS status, ${c('s', 'selling_price')} AS selling_price, ${c('s', 'purchase_price')} AS purchase_price,
      ${c('s', 'show_online')} AS show_online, COALESCE(${c('pc', 'name')} || ' › ' || ${c('ca', 'name')}, ${c('ca', 'name')}) AS category,
      (SELECT COUNT(*) FROM ${T('variants')} v WHERE ${c('v', 'style_id')} = ${c('s', 'id')} AND ${c('v', 'status')} = 'ACTIVE') AS sizes,
      (SELECT COALESCE(SUM(MAX(${c('st', 'qty')}, 0)), 0) FROM ${T('variants')} v JOIN ${T('stock_snapshots')} st ON ${c('st', 'variant_id')} = ${c('v', 'id')} WHERE ${c('v', 'style_id')} = ${c('s', 'id')}) AS on_hand
    ${base} ORDER BY ${c('s', 'updated_at')} DESC, ${c('s', 'id')} DESC LIMIT ${PAGE} OFFSET ${page * PAGE}`, ...args);
  return { q: term, page, total, page_size: PAGE, rows: rows.map(r => ({ id: num(r.id), code: r.code, name: r.name, status: r.status, category: r.category, selling_price: r.selling_price,
    show_online: !!r.show_online, sizes: num(r.sizes), on_hand: num(r.on_hand), ...(seeCost ? { purchase_price: r.purchase_price } : {}) })) };
});
