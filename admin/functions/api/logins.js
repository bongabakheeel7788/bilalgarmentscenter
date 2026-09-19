// GET /api/logins — who tried to open the portal, when, from where; the Owner's page
import { guard } from '../_lib/auth.js';
import { all } from '../_lib/q.js';
export const onRequestGet = guard('user.manage', async (user, db) => ({
  rows: (await all(db, `SELECT at, username, ok, why, ip, agent, device FROM portal_logins ORDER BY id DESC LIMIT 200`)).map(r => ({ ...r, ok: !!r.ok })) }));
