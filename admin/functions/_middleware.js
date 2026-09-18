// Every function runs behind this. A throw anywhere — ensureSchema, a query in
// the door, a report — used to fall out of the isolate as Cloudflare's HTML
// "Worker threw exception" page and the app could only say "500 without a
// message" (2026-09-18, the day the free D1 read quota ran out at 15:30).
// Now the answer is JSON with a reason a shopkeeper can read.
import { json } from './_lib/db.js';

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

export async function onRequest(context) {
  try { return await context.next(); }
  catch (e) {
    if (e && e.status && e.error) return json({ error: e.error, hint: e.hint }, e.status);
    const x = explain(e);
    return json({ error: x.error, hint: x.hint }, x.status);
  }
}
