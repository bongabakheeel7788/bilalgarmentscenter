// POST /api/e — the visit log's receiver (P100). Takes a small batch from
// site/js/track.js, decides the channel, and writes one row per event.
//
// It answers 204 with no body and never blocks anything: the page has already
// gone by the time this runs (sendBeacon), and a failure here must never be
// visible to a customer.
import { ensureSchema, karachiDay } from '../_lib/db.js';
import { attribute, isBot } from '../_lib/channel.js';

const MAX = 20;                       // events per batch; a bigger one is cut, not refused
const KEEP_DAYS = 90;
const no = (status = 204) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (v, n) => { const s = String(v == null ? '' : v).trim(); return s ? s.slice(0, n) : null; };

/**
 * Who this is, without a cookie and without keeping the address: a truncated
 * SHA-256 of (salt + today + IP + user agent). It counts unique visitors for
 * one day and cannot follow anybody into the next one.
 */
async function visitorId(env, day, ip, ua) {
  const data = new TextEncoder().encode(`${env.ANALYTICS_SALT || 'bgc'}|${day}|${ip}|${ua}`);
  const d = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

let prunedDay = null;
async function prune(db, day) {
  if (prunedDay === day) return;
  prunedDay = day;
  const cutoff = new Date(Date.parse(day + 'T00:00:00Z') - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
  try { await db.prepare(`DELETE FROM events WHERE day < ?`).bind(cutoff).run(); } catch { /* a prune is never worth an error */ }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return no();
  const ua = request.headers.get('user-agent') || '';
  if (isBot(ua)) return no();                                    // crawlers are not customers

  let body;
  try { body = await request.json(); } catch { return no(400); }
  const list = Array.isArray(body.e) ? body.e.slice(0, MAX) : [];
  if (!list.length) return no();
  const session = clean(body.s, 40);
  if (!session) return no(400);

  const a = body.a || {};
  const url = new URL(request.url);
  const att = attribute({ source: a.source, medium: a.medium, referrer: a.referrer, ua, selfHost: url.hostname, query: a.q || {} });
  const day = karachiDay();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const visitor = await visitorId(env, day, ip, ua);
  const country = (request.cf && request.cf.country) || null;

  await ensureSchema(env.DB);
  const stmt = env.DB.prepare(`INSERT INTO events
    (day, session, visitor, kind, path, label, value_paisa, channel, source, medium, campaign, content, referrer_host, landing, ref_code, paid, country, device, app)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rows = list
    .filter(e => e && typeof e.k === 'string')
    .map(e => stmt.bind(day, session, visitor, clean(e.k, 20), clean(e.p, 200), clean(e.l, 120),
      Number.isFinite(Number(e.v)) ? Math.round(Number(e.v) * 100) : null,
      att.channel, clean(att.source, 60), clean(att.medium, 60), clean(a.campaign, 80), clean(a.content, 80),
      clean(att.referrer_host, 100), clean(a.landing, 200), clean(a.ref, 10), att.paid ? 1 : 0,
      country, att.device, att.app || null));
  if (!rows.length) return no();
  try { await env.DB.batch(rows); } catch { return no(); }       // a lost visit is not worth an error page
  await prune(env.DB, day);
  return no();
}
