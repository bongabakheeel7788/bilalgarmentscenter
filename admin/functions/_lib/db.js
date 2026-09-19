// P92 — the admin portal's D1 (bgc-admin, bound as DB). One SQLite table per
// mirrored table, each row a JSON document keyed by the shop's primary key —
// the receiver never needs to know a column, so a newer POS never breaks an
// older portal. mirror_runs records every push: the "as of" every page shows.
// P93 — portal_logins (the login audit and the lock counter) and a few
// expression indexes on the hot paths every page reads.
import SPEC from './mirror-spec.js';

export const TABLE = t => 'm_' + t;                       // m_invoices, m_variants …
export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

// P93 — what the pages look up by, so a month of bills is an index walk, not a scan
const INDEXES = [
  ['invoices', 'business_date'], ['invoices', 'invoice_no'], ['invoices', 'customer_id'],
  ['invoice_lines', 'invoice_id'], ['invoice_lines', 'variant_id'],
  ['payments', 'invoice_id'], ['returns', 'business_date'], ['returns', 'original_invoice_id'], ['return_lines', 'return_id'],
  ['cash_movements', 'business_date'], ['expenses', 'business_date'], ['shifts', 'business_date'],
  ['credit_collections', 'customer_id'], ['commission_entries', 'salesperson_id'], ['commission_entries', 'business_date'],
  ['staff_attendance', 'business_date'], ['variants', 'style_id'], ['stock_ledger', 'variant_id'], ['users', 'username'],
];

// ── P109 — the portal counts what it reads ─────────────────────────────────
// D1 hands back meta.rows_read on every query and this code threw it away, so
// when the free 5 M/day allowance ran out twice in two days the only way to ask
// "which page costs what" was to reason about query plans. It is free to keep.
//
// One counter per isolate, reset at the top of each request by _middleware.js.
// Two requests running in the same isolate at the same moment would blur into
// each other; for a portal one shopkeeper reads, that is a fair trade for
// costing nothing. It is a diagnostic, never an input to a decision.
let readCount = 0;
export const readsReset = () => { readCount = 0; };
export const readsSoFar = () => readCount;
/** add up whatever a D1 answer reports — one result, or a batch of them */
export function noteReads(out) {
  for (const r of (Array.isArray(out) ? out : [out])) {
    const n = r && r.meta && Number(r.meta.rows_read);
    if (Number.isFinite(n)) readCount += n;
  }
  return out;
}

/** a stable fingerprint of the schema statements — djb2, deterministic, no crypto */
export function fingerprint(stmts) {
  let h = 5381;
  const s = stmts.join('\n');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

let ready = null;
export function ensureSchema(db) {
  if (!ready) ready = (async () => {
    const stmts = [`CREATE TABLE IF NOT EXISTS mirror_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        table_name TEXT NOT NULL, rows INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL,
        pos_version TEXT, spec_version INTEGER, sent_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS mirror_runs_received ON mirror_runs(received_at)`,
      `CREATE TABLE IF NOT EXISTS portal_logins (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        username TEXT NOT NULL, ok INTEGER NOT NULL, why TEXT, ip TEXT, agent TEXT, device TEXT)`,
      `CREATE INDEX IF NOT EXISTS portal_logins_user ON portal_logins(username, at)`,
      `CREATE INDEX IF NOT EXISTS portal_logins_ip ON portal_logins(ip, at)`];
    for (const t of Object.keys(SPEC.tables)) {
      stmts.push(`CREATE TABLE IF NOT EXISTS ${TABLE(t)} (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT, mirrored_at TEXT NOT NULL)`);
      stmts.push(`CREATE INDEX IF NOT EXISTS ${TABLE(t)}_updated ON ${TABLE(t)}(updated_at)`);
      // every join in reports.js is ON json_extract(x.data, '$.id') = …; without
      // this index SQLite scans the whole table for every row on the other side —
      // one stock count read 1.6 million rows and the free D1 read quota (5 M/day)
      // was gone by mid-afternoon, and every page answered 500 (2026-09-18)
      stmts.push(`CREATE INDEX IF NOT EXISTS ${TABLE(t)}_id ON ${TABLE(t)}(json_extract(data, '$.id'))`);
    }
    for (const [t, col] of INDEXES) if (SPEC.tables[t]) stmts.push(`CREATE INDEX IF NOT EXISTS ${TABLE(t)}_${col} ON ${TABLE(t)}(json_extract(data, '$.${col}'))`);
    // P109 — one row read, not 150 statements. Every cold isolate ran this whole
    // batch, and Cloudflare recycles isolates constantly: ~150 CREATE ... IF NOT
    // EXISTS, each consulting a 202-object schema catalogue, as a fixed toll on a
    // portal that had not yet decided whether the caller was even logged in. The
    // statements are the schema, so their fingerprint IS the version — nobody has
    // to remember to bump a number when they add an index.
    const want = fingerprint(stmts);
    // the table may not exist yet: that throw IS the "first run" signal
    const seen = await db.prepare(`SELECT v FROM schema_state WHERE k = 'fingerprint'`).first().catch(() => null);
    if (seen && seen.v === want) return;

    // one round trip, not ninety: D1 is a network away — statement by statement
    // it took 20 s on the live portal
    stmts.push(`CREATE TABLE IF NOT EXISTS schema_state (k TEXT PRIMARY KEY, v TEXT NOT NULL, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    await db.batch(stmts.map(s => db.prepare(s)));
    // P97 — the live table was made before `device` existed; SQLite has no ADD COLUMN IF NOT EXISTS
    try { await db.prepare(`ALTER TABLE portal_logins ADD COLUMN device TEXT`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    // written LAST: if anything above threw, the next isolate must do the work again
    await db.prepare(`INSERT INTO schema_state (k, v, at) VALUES ('fingerprint', ?1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at`).bind(want).run();
  })().catch(e => { ready = null; throw e; });
  return ready;
}

/** the shop speaks with its own secret; compared without leaking its length in timing */
export function shopAuthorised(context) {
  const want = context.env.ADMIN_MIRROR_TOKEN || '';
  const got = (context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return timingSafeEqual(want, got);
}
export function timingSafeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** when the portal last received anything — the freshness every page shows */
export async function lastPush(db) {
  const r = await db.prepare(`SELECT MAX(received_at) AS at FROM mirror_runs WHERE kind = 'rows'`).first();
  return r && r.at ? r.at : null;
}
