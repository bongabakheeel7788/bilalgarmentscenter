// POST /api/auth/login — the POS username and password; the portal verifier decides (P93 §1)
import { ensureSchema, json } from '../../_lib/db.js';
import { login } from '../../_lib/auth.js';
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: 'NO_DATABASE' }, 500);
  await ensureSchema(db);
  let body; try { body = await context.request.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  return login(context, db, body || {});
}
