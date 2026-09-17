// GET /api/mirror/ping — "is this the right token, and when did you last hear from me?"
import { ensureSchema, json, shopAuthorised, lastPush } from '../../_lib/db.js';
export async function onRequestGet(context) {
  if (!shopAuthorised(context)) return json({ error: 'UNAUTHORISED' }, 401);
  const db = context.env.DB;
  if (!db) return json({ error: 'NO_DATABASE', hint: 'Bind the D1 database bgc-admin as DB on this Pages project.' }, 500);
  await ensureSchema(db);
  return json({ ok: true, last_push_at: await lastPush(db) });
}
