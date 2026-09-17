// GET /api/bills/:id — one bill: lines, payments, returns against it
import { guard, can } from '../../_lib/auth.js';
import { T, c, num, all, first, err } from '../../_lib/q.js';
export const onRequestGet = guard('pos.history.all', async (user, db, context) => {
  const id = Number(context.params.id);
  const r = await first(db, `SELECT i.data AS i, ${c('cu', 'name')} AS customer, ${c('cu', 'phone')} AS phone, ${c('sp', 'name')} AS salesman, ${c('ca', 'name')} AS cashier
    FROM ${T('invoices')} i LEFT JOIN ${T('customers')} cu ON ${c('cu', 'id')} = ${c('i', 'customer_id')}
    LEFT JOIN ${T('users')} sp ON ${c('sp', 'id')} = ${c('i', 'salesperson_id')} LEFT JOIN ${T('users')} ca ON ${c('ca', 'id')} = ${c('i', 'cashier_id')}
    WHERE ${c('i', 'id')} = ?1`, id);
  if (!r.i) throw err(404, 'NOT_FOUND', 'No such bill on the portal.');
  const inv = JSON.parse(r.i);
  const seeCost = can(user, 'report.margin');
  const lines = (await all(db, `SELECT il.data AS d, COALESCE(${c('s', 'name')}, ${c('il', 'description')}) AS style, ${c('s', 'code')} AS code, ${c('sz', 'label')} AS size, ${c('co', 'name')} AS colour, ${c('v', 'sku')} AS sku
    FROM ${T('invoice_lines')} il LEFT JOIN ${T('variants')} v ON ${c('v', 'id')} = ${c('il', 'variant_id')} LEFT JOIN ${T('styles')} s ON ${c('s', 'id')} = ${c('v', 'style_id')}
    LEFT JOIN ${T('sizes')} sz ON ${c('sz', 'id')} = ${c('v', 'size_id')} LEFT JOIN ${T('colours')} co ON ${c('co', 'id')} = ${c('v', 'colour_id')}
    WHERE ${c('il', 'invoice_id')} = ?1 ORDER BY ${c('il', 'line_no')}`, id)).map(x => {
    const l = JSON.parse(x.d);
    return { line_no: l.line_no, style: x.style, code: x.code, size: x.size, colour: x.colour, sku: x.sku, qty: l.qty, unit_price: l.unit_price, line_discount: l.line_discount,
      bill_discount_share: l.bill_discount_share, line_total: l.line_total, returned_qty: l.returned_qty, ...(seeCost ? { cost_at_sale: l.cost_at_sale } : {}) };
  });
  const payments = (await all(db, `SELECT p.data AS d FROM ${T('payments')} p WHERE ${c('p', 'invoice_id')} = ?1 ORDER BY ${c('p', 'id')}`, id)).map(x => { const p = JSON.parse(x.d); return { method: p.method, amount: p.amount, tendered: p.tendered, change_given: p.change_given, reference: p.reference, at: p.created_at }; });
  const returns = (await all(db, `SELECT r.data AS d FROM ${T('returns')} r WHERE ${c('r', 'original_invoice_id')} = ?1 ORDER BY ${c('r', 'id')}`, id)).map(x => { const t = JSON.parse(x.d); return { id: t.id, return_no: t.return_no, type: t.type, business_date: t.business_date, refund_amount: t.refund_amount, refund_method: t.refund_method, status: t.status, reason_code: t.reason_code }; });
  const pick = ['id', 'invoice_no', 'business_date', 'created_at', 'status', 'payment_status', 'subtotal', 'discount', 'discount_reason', 'round_off', 'total', 'amount_paid', 'balance_due', 'channel', 'notes', 'void_reason', 'voided_at', 'staff_purchase', 'is_practice'];
  const bill = Object.fromEntries(pick.map(k => [k, inv[k]]));
  return { bill: { ...bill, customer: r.customer, phone: r.phone, salesman: r.salesman, cashier: r.cashier }, lines, payments, returns };
});
