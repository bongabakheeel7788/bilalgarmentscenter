// P93 — who is looking. The POS accounts, verified with the portal verifier the
// POS derived (PBKDF2-SHA256, 100,000 rounds — modules/mirror/service.js
// derive()), a signed cookie for the session, and the POS's own permission
// engine run over the mirrored role/user tables. Nothing here can write to
// the shop; nothing here can approve anything.
import { json, timingSafeEqual, lastPush, TABLE } from './db.js';

const COOKIE = 'bgc_admin';
const HOURS = 12;
const LOCK_AFTER = 5, LOCK_MINUTES = 15;
const PBKDF2_ROUNDS = 100000;
const PORTAL_ROLES = ['Owner', 'Manager'];
const LEVEL_RANK = { DENY: 0, PIN: 1, ALLOW: 2 };

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

/** the same bytes the POS wrote: PBKDF2-SHA256(password, salt, 100k, 32 B) as base64 */
export async function derive(password, saltB64) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: PBKDF2_ROUNDS }, key, 256);
  return b64(bits);
}

async function hmac(secret, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}
async function sign(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}
async function verify(secret, token) {
  if (!token || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  if (!timingSafeEqual(mac, await hmac(secret, body))) return null;
  try { const p = JSON.parse(new TextDecoder().decode(unb64url(body))); return p && p.exp > Date.now() ? p : null; } catch { return null; }
}

const cookieOf = req => { const m = /(?:^|;\s*)bgc_admin=([^;]+)/.exec(req.headers.get('cookie') || ''); return m ? m[1] : null; };
const setCookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ── permissions, the POS's way (server/lib/permissions.js loadEffective) ────
export async function loadEffective(db, userId) {
  const { results: viaRoles } = await db.prepare(`
    SELECT json_extract(p.data,'$.key') AS key, json_extract(rp.data,'$.level') AS level
      FROM ${TABLE('user_roles')} ur
      JOIN ${TABLE('role_permissions')} rp ON json_extract(rp.data,'$.role_id') = json_extract(ur.data,'$.role_id')
      JOIN ${TABLE('permissions')} p ON json_extract(p.data,'$.id') = json_extract(rp.data,'$.permission_id')
     WHERE json_extract(ur.data,'$.user_id') = ?1`).bind(userId).all();
  const eff = {};
  for (const r of viaRoles || []) if (!eff[r.key] || LEVEL_RANK[r.level] > LEVEL_RANK[eff[r.key]]) eff[r.key] = r.level;
  const { results: overrides } = await db.prepare(`
    SELECT json_extract(p.data,'$.key') AS key, json_extract(up.data,'$.level') AS level
      FROM ${TABLE('user_permissions')} up JOIN ${TABLE('permissions')} p ON json_extract(p.data,'$.id') = json_extract(up.data,'$.permission_id')
     WHERE json_extract(up.data,'$.user_id') = ?1 AND json_extract(up.data,'$.frozen_at') IS NULL`).bind(userId).all();
  for (const r of overrides || []) eff[r.key] = r.level;
  return eff;
}
export const can = (user, key) => !!user && user.perms[key] === 'ALLOW';

async function userByName(db, username) {
  const r = await db.prepare(`SELECT u.data AS u, json_extract(r.data,'$.name') AS role FROM ${TABLE('users')} u
    LEFT JOIN ${TABLE('roles')} r ON json_extract(r.data,'$.id') = json_extract(u.data,'$.primary_role_id')
    WHERE lower(json_extract(u.data,'$.username')) = lower(?1)`).bind(String(username || '').trim()).first();
  if (!r) return null;
  const u = JSON.parse(r.u);
  return { id: Number(u.id), name: u.name, username: u.username, status: u.status, role: r.role, portal_hash: u.portal_hash, portal_salt: u.portal_salt };
}
async function userById(db, id) {
  const r = await db.prepare(`SELECT u.data AS u, json_extract(r.data,'$.name') AS role FROM ${TABLE('users')} u
    LEFT JOIN ${TABLE('roles')} r ON json_extract(r.data,'$.id') = json_extract(u.data,'$.primary_role_id')
    WHERE json_extract(u.data,'$.id') = ?1`).bind(Number(id)).first();
  if (!r) return null;
  const u = JSON.parse(r.u);
  return { id: Number(u.id), name: u.name, username: u.username, status: u.status, role: r.role };
}

// ── login ───────────────────────────────────────────────────────────────────
export async function login(context, db, { username, password }) {
  const secret = context.env.ADMIN_SESSION_SECRET;
  if (!secret) return json({ error: 'NO_SESSION_SECRET', hint: 'ADMIN_SESSION_SECRET is not set on this Pages project.' }, 500);
  username = String(username || '').trim();
  const ip = context.request.headers.get('cf-connecting-ip') || '';
  const agent = (context.request.headers.get('user-agent') || '').slice(0, 200);
  const record = (ok, why) => db.prepare(`INSERT INTO portal_logins (username, ok, why, ip, agent) VALUES (?1, ?2, ?3, ?4, ?5)`).bind(username, ok ? 1 : 0, why || null, ip, agent).run();
  const refuse = async (status, error, hint, why) => { await record(false, why || error); return json({ error, hint }, status); };
  if (!username || !password) return refuse(400, 'BAD_LOGIN', 'Username and password, please.');
  // the lock: five misses on this username in fifteen minutes
  const since = new Date(Date.now() - LOCK_MINUTES * 60e3).toISOString();
  // only a wrong password (or a name nobody has) is a guess; "log in to the POS
  // first" and "not a portal user" are answers, and answering five times must
  // not lock the Owner out of finding out what was wrong (2026-09-18, Fahad)
  const misses = await db.prepare(`SELECT COUNT(*) AS n FROM portal_logins WHERE username = ?1 AND ok = 0 AND why IN ('bad_password', 'no_user') AND at > ?2`).bind(username, since).first();
  if (misses && misses.n >= LOCK_AFTER) return refuse(423, 'LOCKED', `Too many tries — wait ${LOCK_MINUTES} minutes.`);
  const u = await userByName(db, username);
  if (!u) return refuse(401, 'BAD_LOGIN', 'That username and password do not match.', 'no_user');
  if (u.status !== 'ACTIVE') return refuse(403, 'NOT_PORTAL_USER', 'This account is not active on the POS.', 'inactive');
  if (!PORTAL_ROLES.includes(u.role)) return refuse(403, 'NOT_PORTAL_USER', 'The portal is for the Owner and Managers.', 'role');
  if (!u.portal_hash || !u.portal_salt) return refuse(403, 'NO_VERIFIER', 'Log in to the POS once, then try again.', 'no_verifier');
  const got = await derive(password, u.portal_salt);
  if (!timingSafeEqual(got, u.portal_hash)) return refuse(401, 'BAD_LOGIN', 'That username and password do not match.', 'bad_password');
  await record(true);
  const exp = Date.now() + HOURS * 3600e3;
  const token = await sign(secret, { uid: u.id, exp });
  const perms = await loadEffective(db, u.id); permCache.set(u.id, { perms, at: Date.now() });
  return json({ ok: true, user: { id: u.id, name: u.name, username: u.username, role: u.role }, perms, as_of: await lastPush(db) },
    200, { 'Set-Cookie': setCookie(token, HOURS * 3600) });
}
export const logout = () => json({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0) });

// P96 — a warm isolate remembers a user's keys for a minute: the three
// permission queries were paid on every request. A key changed on the POS
// reaches the portal at the next push and is seen here within a minute.
const PERM_TTL = 60e3;
const permCache = new Map();
async function permsFor(db, userId) {
  const hit = permCache.get(userId);
  if (hit && hit.at > Date.now() - PERM_TTL) return hit.perms;
  const perms = await loadEffective(db, userId);
  permCache.set(userId, { perms, at: Date.now() });
  return perms;
}

/** the session on a request, or null; renews the cookie when it is past half-way */
export async function currentUser(context, db) {
  const secret = context.env.ADMIN_SESSION_SECRET;
  const p = secret ? await verify(secret, cookieOf(context.request)) : null;
  if (!p) return null;
  const u = await userById(db, p.uid);
  if (!u || u.status !== 'ACTIVE' || !PORTAL_ROLES.includes(u.role)) return null;   // disabled on the POS = gone here at the next push
  u.perms = await permsFor(db, u.id);
  if (p.exp - Date.now() < HOURS * 1800e3) u.renew = await sign(secret, { uid: u.id, exp: Date.now() + HOURS * 3600e3 });
  return u;
}

/**
 * The one door every data route goes through: a session, then the key.
 * `handler(user, db, context)` returns a plain object; `as_of` is added and
 * the renewed cookie rides along. Errors thrown as {status, error, hint} pass
 * through in words; anything else is a 500 with no internals.
 */
export function guard(key, handler) {
  return async context => {
    const db = context.env.DB;
    if (!db) return json({ error: 'NO_DATABASE' }, 500);
    const { ensureSchema } = await import('./db.js');
    await ensureSchema(db);
    const user = await currentUser(context, db);
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);
    if (key && !can(user, key)) return json({ error: 'FORBIDDEN', permission: key }, 403);
    try {
      const [out, asOf] = await Promise.all([handler(user, db, context), lastPush(db)]);
      const extra = user.renew ? { 'Set-Cookie': setCookie(user.renew, HOURS * 3600) } : {};
      return json({ ...out, as_of: asOf }, 200, extra);
    } catch (e) {
      if (e && e.status) return json({ error: e.error || 'ERROR', hint: e.hint }, e.status);
      return json({ error: 'PORTAL_ERROR', hint: String(e && e.message || e).slice(0, 200) }, 500);
    }
  };
}
export const err = (status, error, hint) => Object.assign(new Error(error), { status, error, hint });
