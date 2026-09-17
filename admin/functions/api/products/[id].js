// GET /api/products/:id — one style, every size and colour with its stock and price (cost per size with catalog.view_cost)
import { guard, can } from '../../_lib/auth.js';
import { T, c, num, all, first, err } from '../../_lib/q.js';
export const onRequestGet = guard('catalog.view', async (user, db, context) => {
  const id = Number(context.params.id);
  const r = await first(db, `SELECT s.data AS s, COALESCE(${c('pc', 'name')} || ' › ' || ${c('ca', 'name')}, ${c('ca', 'name')}) AS category, ${c('sg', 'name')} AS size_group, ${c('su', 'name')} AS supplier
    FROM ${T('styles')} s LEFT JOIN ${T('categories')} ca ON ${c('ca', 'id')} = ${c('s', 'category_id')} LEFT JOIN ${T('categories')} pc ON ${c('pc', 'id')} = ${c('ca', 'parent_id')}
    LEFT JOIN ${T('size_groups')} sg ON ${c('sg', 'id')} = ${c('s', 'size_group_id')} LEFT JOIN ${T('suppliers')} su ON ${c('su', 'id')} = ${c('s', 'supplier_id')} WHERE ${c('s', 'id')} = ?1`, id);
  if (!r.s) throw err(404, 'NOT_FOUND', 'No such product on the portal.');
  const s = JSON.parse(r.s);
  const seeCost = can(user, 'catalog.view_cost');
  const variants = (await all(db, `SELECT v.data AS v, ${c('sz', 'label')} AS size, ${c('co', 'name')} AS colour, ${c('st', 'qty')} AS qty, ${c('st', 'damaged_qty')} AS damaged, ${c('st', 'avg_cost')} AS avg_cost,
      (SELECT ${c('b', 'code')} FROM ${T('barcodes')} b WHERE ${c('b', 'variant_id')} = ${c('v', 'id')} AND ${c('b', 'is_primary')} LIMIT 1) AS barcode
    FROM ${T('variants')} v LEFT JOIN ${T('sizes')} sz ON ${c('sz', 'id')} = ${c('v', 'size_id')} LEFT JOIN ${T('colours')} co ON ${c('co', 'id')} = ${c('v', 'colour_id')}
    LEFT JOIN ${T('stock_snapshots')} st ON ${c('st', 'variant_id')} = ${c('v', 'id')}
    WHERE ${c('v', 'style_id')} = ?1 ORDER BY ${c('co', 'name')}, ${c('sz', 'sort_order')}`, id)).map(x => {
    const v = JSON.parse(x.v);
    return { id: v.id, sku: v.sku, barcode: x.barcode, size: x.size, colour: x.colour, status: v.status, qty: num(x.qty), damaged: num(x.damaged),
      selling_price: v.selling_price_override ?? s.selling_price, own_price: v.selling_price_override != null,
      ...(seeCost ? { purchase_price: v.purchase_price_override ?? s.purchase_price, own_cost: v.purchase_price_override != null, avg_cost: x.avg_cost } : {}) };
  });
  const pick = ['id', 'code', 'name', 'status', 'selling_price', 'shelf_price', 'fabric', 'gender', 'occasion', 'season', 'product_type', 'show_online', 'notes', 'created_at', 'updated_at'];
  return { style: { ...Object.fromEntries(pick.map(k => [k, s[k]])), category: r.category, size_group: r.size_group, supplier: r.supplier, ...(seeCost ? { purchase_price: s.purchase_price } : {}) }, variants };
});
