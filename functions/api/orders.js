// POST /api/orders — a guest checkout. Everything the customer typed is
// checked here against the published catalogue: prices and availability as
// published, the delivery charge recomputed, the phone normalised, the block
// list consulted, a per-phone and per-IP limit. Nothing about money or stock
// is decided here — the POS confirms by phone and records the sale on delivery.
import { loadCatalogue, deliveryCharge } from '../_lib/catalogue.js';
import { ensureSchema, json, normalisePhone, orderNo } from '../_lib/db.js';

const paisa = n => Math.round(Number(n) * 100);
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'NOT_CONFIGURED', message: 'Ordering is not switched on yet — please order on WhatsApp.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  if (clean(body.website, 10)) return json({ error: 'REJECTED' }, 400);          // honeypot
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstile, request.headers.get('cf-connecting-ip'));
    if (!ok) return json({ error: 'BOT_CHECK', message: 'The bot check did not pass — please try again.' }, 400);
  }
  const cat = await loadCatalogue(context);
  const errors = {};
  const name = clean(body.name, 80); if (name.length < 2) errors.name = 'Your name, please.';
  const phone = normalisePhone(body.phone); if (!phone) errors.phone = 'A Pakistani mobile number, like 0300 1234567.';
  const alt = body.alt_phone ? normalisePhone(body.alt_phone) : null; if (body.alt_phone && !alt) errors.alt_phone = 'Not a mobile number.';
  const delivery = body.delivery === 'COLLECT' ? 'COLLECT' : 'DELIVERY';
  const address = clean(body.address, 400), city = clean(body.city, 60), province = clean(body.province, 40);
  if (delivery === 'DELIVERY') { if (address.length < 10) errors.address = 'The full address — house, street, area, a landmark.'; if (city.length < 2) errors.city = 'Which city?'; }
  const ref = clean(body.ref, 4).replace(/\D/g, ''); if (body.ref && !/^\d{3,4}$/.test(ref)) errors.ref = 'A referral code is 3 or 4 digits.';
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 20) : [];
  if (!lines.length) errors.lines = 'The cart is empty.';
  const out = [], soldOut = [];
  let subtotal = 0;
  for (const l of lines) {
    const hit = cat.byVariant.get(Number(l.variant_id));
    const qty = Math.max(1, Math.min(10, Math.floor(Number(l.qty) || 1)));
    if (!hit) { soldOut.push({ variant_id: l.variant_id, reason: 'gone' }); continue; }
    if (hit.v.availability === 'out') { soldOut.push({ variant_id: l.variant_id, code: hit.p.code, name: hit.p.name, size: hit.v.size, reason: 'sold out' }); continue; }
    const price = paisa(hit.v.price);
    subtotal += price * qty;
    out.push({ variant_id: Number(hit.v.id), code: hit.p.code, slug: hit.p.slug, name: hit.p.name, size: hit.v.size, colour: hit.v.colour, price_paisa: price, qty });
  }
  if (soldOut.length) return json({ error: 'SOLD_OUT', items: soldOut, message: 'Some pieces have sold out since you added them.' }, 409);
  if (Object.keys(errors).length) return json({ error: 'VALIDATION', fields: errors }, 400);

  const db = env.DB;
  await ensureSchema(db);
  if (await db.prepare(`SELECT 1 FROM blocked_phones WHERE phone = ?`).bind(phone).first()) {
    return json({ error: 'BLOCKED', message: 'We could not place this order — please contact us on WhatsApp.' }, 403);
  }
  const ip = request.headers.get('cf-connecting-ip') || '';
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const byPhone = await db.prepare(`SELECT count(*) AS n FROM orders WHERE phone = ? AND created_at > ?`).bind(phone, since).first();
  const byIp = ip ? await db.prepare(`SELECT count(*) AS n FROM orders WHERE ip = ? AND created_at > ?`).bind(ip, since).first() : { n: 0 };
  if ((byPhone && byPhone.n >= 3) || (byIp && byIp.n >= 6)) return json({ error: 'TOO_MANY', message: 'Too many orders in a short time — please wait a few minutes or message us on WhatsApp.' }, 429);

  const del = paisa(deliveryCharge(cat.store, subtotal / 100, delivery));
  const utm = body.utm || {};
  const r = await db.prepare(`INSERT INTO orders (name, phone, alt_phone, address, city, province, note, delivery, ref_code, ref_known, prepaid_ref,
      utm_source, utm_medium, utm_campaign, utm_content, campaign, landing, subtotal_paisa, delivery_paisa, total_paisa, ip, ua)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(name, phone, alt, delivery === 'DELIVERY' ? address : null, delivery === 'DELIVERY' ? city : null, delivery === 'DELIVERY' ? province || null : null, clean(body.note, 200) || null,
      delivery, ref || null, ref && cat.agentCodes.has(ref) ? 1 : 0, clean(body.prepaid_ref, 60) || null,
      clean(utm.source, 60) || null, clean(utm.medium, 60) || null, clean(utm.campaign, 80) || null, clean(utm.content, 80) || null, clean(utm.c, 80) || null, clean(utm.landing, 300) || null,
      subtotal, del, subtotal + del, ip || null, clean(request.headers.get('user-agent'), 200) || null).run();
  const id = r.meta && r.meta.last_row_id;
  const no = orderNo(id);
  await db.prepare(`UPDATE orders SET no = ? WHERE id = ?`).bind(no, id).run();
  await db.batch(out.map(l => db.prepare(`INSERT INTO order_lines (order_id, variant_id, code, slug, name, size, colour, price_paisa, qty) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(id, l.variant_id, l.code, l.slug, l.name, l.size, l.colour, l.price_paisa, l.qty)));
  return json({ ok: true, no, total: (subtotal + del) / 100, delivery_charge: del / 100, lines: out.map(l => ({ ...l, price: l.price_paisa / 100 })) }, 201);
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, response: token, remoteip: ip || undefined }) });
    const j = await res.json();
    return !!j.success;
  } catch { return false; }
}
