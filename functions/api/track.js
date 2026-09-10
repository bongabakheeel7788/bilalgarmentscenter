// GET /api/track?no=WEB-000123&phone=03xx — the customer's own order: status,
// the courier's tracking number once dispatched, the lines. Nothing else.
import { ensureSchema, json, normalisePhone, orderWithLines } from '../_lib/db.js';

const PUBLIC_STATUS = {
  NEW: 'Received — we will call you to confirm',
  CONFIRMED: 'Confirmed — being packed',
  PACKED: 'Packed — waiting for the courier',
  DISPATCHED: 'On its way with the courier',
  DELIVERED: 'Delivered',
  RTO: 'Returned to the shop',
  CANCELLED: 'Cancelled',
  READY: 'Ready to collect from the shop',
  COLLECTED: 'Collected',
};

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'NOT_CONFIGURED' }, 503);
  const url = new URL(request.url);
  const no = String(url.searchParams.get('no') || '').trim().toUpperCase();
  const phone = normalisePhone(url.searchParams.get('phone'));
  if (!/^WEB-\d{6}$/.test(no) || !phone) return json({ error: 'NOT_FOUND', message: 'No order with that number and phone.' }, 404);
  await ensureSchema(env.DB);
  const o = await orderWithLines(env.DB, 'no = ? AND phone = ?', [no, phone]);
  if (!o) return json({ error: 'NOT_FOUND', message: 'No order with that number and phone.' }, 404);
  return json({
    no: o.no, status: o.status, status_text: PUBLIC_STATUS[o.status] || o.status, delivery: o.delivery,
    created_at: o.created_at, status_updated_at: o.status_updated_at, tracking_no: o.tracking_no, courier: o.courier, tracking_url: o.tracking_url,
    subtotal: o.subtotal_paisa / 100, delivery_charge: o.delivery_paisa / 100, total: o.total_paisa / 100,
    lines: o.lines.map(l => ({ code: l.code, slug: l.slug, name: l.name, size: l.size, colour: l.colour, price: l.price_paisa / 100, qty: l.qty })),
  });
}
