// P165 — who may review what (Fahad, 2026-09-28: "online only, approve genuine ones, photos later"). A review is
// taken only from a number whose ONLINE order of that piece was delivered (or collected); the pack of a deal counts
// for the deal's product. The POS decides what shows. Nothing here ever answers with a phone number.
import { json, normalisePhone } from './db.js';

export const REVIEWED = ['DELIVERED', 'COLLECTED'];
export const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** "Ayesha Khan" → "Ayesha": the first name only is ever published */
export const firstName = s => clean(s, 60).split(' ')[0].slice(0, 24);

/** the codes an order carries: its lines, and the product behind each pack */
export function codesOf(cat, lines, packs) {
  const byDeal = new Map((cat.deals || []).map(d => [Number(d.id), d.style_code]));
  return [...new Set([...(lines || []).map(l => l.code), ...(packs || []).map(k => byDeal.get(Number(k.deal_id)))].filter(Boolean))];
}

/** the newest delivered order of this number that carried this product, or null */
export async function boughtBy(db, cat, phone, code) {
  const dealIds = (cat.deals || []).filter(d => d.style_code === code).map(d => Number(d.id));
  const packs = dealIds.length ? ` OR EXISTS (SELECT 1 FROM order_packs k WHERE k.order_id = o.id AND k.deal_id IN (${dealIds.map(() => '?').join(',')}))` : '';
  return db.prepare(`SELECT o.id, o.no, o.name, o.city FROM orders o
      WHERE o.phone = ? AND o.status IN ('DELIVERED','COLLECTED')
        AND (EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id = o.id AND l.code = ?)${packs})
      ORDER BY o.id DESC LIMIT 1`).bind(phone, code, ...dealIds).first();
}

/** ten tries an hour from one connection, five for one number — then "wait" */
export async function tooMany(db, ip, phone) {
  const since = new Date(Date.now() - 3600e3).toISOString();
  await db.prepare(`DELETE FROM review_tries WHERE at < ?`).bind(since).run();
  const a = ip ? await db.prepare(`SELECT count(*) AS n FROM review_tries WHERE ip = ? AND at > ?`).bind(ip, since).first() : { n: 0 };
  const b = phone ? await db.prepare(`SELECT count(*) AS n FROM review_tries WHERE phone = ? AND at > ?`).bind(phone, since).first() : { n: 0 };
  await db.prepare(`INSERT INTO review_tries (ip, phone) VALUES (?, ?)`).bind(ip || null, phone || null).run();
  return (a && a.n >= 10) || (b && b.n >= 5);
}
export const TOO_MANY = () => json({ error: 'TOO_MANY', message: 'Too many tries — please wait an hour, or message us on WhatsApp.' }, 429);

export async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, response: token, remoteip: ip || undefined }) });
    const j = await res.json();
    return !!j.success;
  } catch { return false; }
}
export { normalisePhone };
