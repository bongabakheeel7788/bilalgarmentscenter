// Every function runs behind this. A throw anywhere — ensureSchema, a query in
// the door, a report — used to fall out of the isolate as Cloudflare's HTML
// "Worker threw exception" page and the app could only say "500 without a
// message" (2026-09-18, the day the free D1 read quota ran out at 15:30).
// Now the answer is JSON with a reason a shopkeeper can read.
import { json, readsReset, readsSoFar } from './_lib/db.js';

const QUOTA = /daily row (read|write) limit|exceeded D1's free tier|code.{0,4}7500/i;

export function explain(e) {
  const msg = String(e && e.message || e || '');
  if (QUOTA.test(msg)) {
    const what = /write/i.test(msg) ? 'writes' : 'reads';
    return { status: 503, error: 'PORTAL_QUOTA', hint: `The portal's database has used up its free daily allowance of ${what}. It comes back at 05:00 (midnight UTC); nothing in the shop is affected, and the POS will catch the portal up by itself.` };
  }
  if (/D1_ERROR|SQLITE_|no such (table|column)/i.test(msg)) return { status: 503, error: 'PORTAL_DATABASE', hint: `The portal's database refused: ${msg.slice(0, 160)}` };
  return { status: 500, error: 'PORTAL_ERROR', hint: msg.slice(0, 200) || 'The portal hit an error it could not name — try again in a moment.' };
}

// P97 — what every answer carries: no sniffing, no framing, no referrer, no
// camera; and nothing under /api/ is ever kept in a shared phone's cache
export const HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function harden(res, url) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
  if (url.pathname.startsWith('/api/')) out.headers.set('Cache-Control', 'no-store');
  // P109 — what this request cost, in the answer itself. The free D1 allowance is
  // 5 M rows a day and it ran out twice in two days; without this the only way to
  // ask "which page is expensive" was to reason about query plans and hope. Now
  // the portal says so, and `curl -sI` on any endpoint settles it.
  out.headers.set('X-Rows-Read', String(readsSoFar()));
  return out;
}
export async function onRequest(context) {
  const url = new URL(context.request.url);
  readsReset();
  try { return harden(await context.next(), url); }
  catch (e) {
    if (e && e.status && e.error) return harden(json({ error: e.error, hint: e.hint }, e.status), url);
    const x = explain(e);
    return harden(json({ error: x.error, hint: x.hint }, x.status), url);
  }
}
