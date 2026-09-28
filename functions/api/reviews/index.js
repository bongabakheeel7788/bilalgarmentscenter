// POST /api/reviews — P165. { code, phone, stars, text, name?, city?, turnstile, website (honeypot) }
// Taken only from a number whose delivered online order carried this piece; one per number per product. It waits
// for the shop: the POS pulls it, the Owner or a Manager approves it, and the next publish puts it on the page.
import { loadCatalogue } from '../../_lib/catalogue.js';
import { ensureSchema, json } from '../../_lib/db.js';
import { boughtBy, tooMany, TOO_MANY, clean, firstName, normalisePhone, verifyTurnstile } from '../../_lib/reviews.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'NOT_CONFIGURED', message: 'Reviews are not switched on yet.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  if (clean(body.website, 10)) return json({ error: 'REJECTED' }, 400);           // honeypot
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstile, ip))) {
    return json({ error: 'BOT_CHECK', message: 'The bot check did not pass — please try again.' }, 400);
  }
  const cat = await loadCatalogue(context);
  const code = clean(body.code, 30);
  // P168 — a pack's product may be off the website (tights are sold online only as packs); its pack page takes reviews
  const product = cat.products.find(p => p.code === code) || (cat.deals || []).find(d => d.style_code === code);
  if (!product) return json({ error: 'NOT_FOUND', message: 'That piece is not on the website any more.' }, 404);
  const errors = {};
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) errors.stars = 'Tap the stars — one to five.';
  const phone = normalisePhone(body.phone); if (!phone) errors.phone = 'The mobile number you ordered with, like 0300 1234567.';
  if (String(body.text || '').trim().length > 600) errors.text = 'Keep it under 600 characters, please.';
  if (Object.keys(errors).length) return json({ error: 'VALIDATION', fields: errors }, 400);

  const db = env.DB;
  await ensureSchema(db);
  if (await tooMany(db, ip, phone)) return TOO_MANY();
  const order = await boughtBy(db, cat, phone, code);
  if (!order) return json({ error: 'NOT_A_BUYER', message: 'Reviews are from customers who received this piece. Ordered it? Use the number you ordered with — and if it has not arrived yet, come back once it has.' }, 403);
  if (await db.prepare(`SELECT 1 FROM reviews WHERE phone = ? AND code = ?`).bind(phone, code).first()) {
    return json({ error: 'ALREADY', message: 'You have already reviewed this piece — thank you!' }, 409);
  }
  const name = firstName(body.name) || firstName(order.name) || 'Customer';
  const city = clean(body.city, 40) || clean(order.city, 40) || null;
  await db.prepare(`INSERT INTO reviews (code, order_no, phone, name, city, stars, body, ip) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(code, order.no, phone, name, city, stars, clean(body.text, 600) || null, ip || null).run();
  return json({ ok: true, message: 'Thank you! Your review shows on the page once the shop has read it.' }, 201);
}
