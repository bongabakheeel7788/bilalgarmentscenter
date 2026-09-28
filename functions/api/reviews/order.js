// POST /api/reviews/order — P165, the page a "please rate your order" WhatsApp opens (/review/WEB-000123/).
// { no, phone } → the pieces of that delivered order that are still on the website, each with whether this number
// has reviewed it, and the first name and city to prefill. The order number alone shows nothing: the number
// it was placed with must match, as on the Track page.
import { loadCatalogue } from '../../_lib/catalogue.js';
import { ensureSchema, json, orderWithLines } from '../../_lib/db.js';
import { codesOf, tooMany, TOO_MANY, clean, firstName, normalisePhone, REVIEWED } from '../../_lib/reviews.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'NOT_CONFIGURED' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  const no = clean(body.no, 12).toUpperCase(), phone = normalisePhone(body.phone);
  if (!/^WEB-\d{6}$/.test(no) || !phone) return json({ error: 'VALIDATION', message: 'The order number (WEB-000123) and the mobile number you ordered with.' }, 400);
  const db = env.DB;
  await ensureSchema(db);
  if (await tooMany(db, request.headers.get('cf-connecting-ip') || '', phone)) return TOO_MANY();
  const o = await orderWithLines(db, 'no = ? AND phone = ?', [no, phone]);
  if (!o) return json({ error: 'NOT_FOUND', message: 'No order with that number and mobile number. Check both, or message us on WhatsApp.' }, 404);
  if (!REVIEWED.includes(o.status)) return json({ error: 'NOT_YET', message: 'This order has not been delivered yet — come back once it has arrived.' }, 409);
  const cat = await loadCatalogue(context);
  const done = new Set(((await db.prepare(`SELECT code FROM reviews WHERE phone = ?`).bind(phone).all()).results || []).map(r => r.code));
  const items = codesOf(cat, o.lines, o.packs).map(code => cat.products.find(p => p.code === code)).filter(Boolean)
    .map(p => ({ code: p.code, name: p.name, slug: p.slug, cover: p.cover || null, reviewed: done.has(p.code) }));
  return json({ ok: true, no, name: firstName(o.name), city: clean(o.city, 40) || '', items });
}
