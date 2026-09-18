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
        username TEXT NOT NULL, ok INTEGER NOT NULL, why TEXT, ip TEXT, agent TEXT)`,
      `CREATE INDEX IF NOT EXISTS portal_logins_user ON portal_logins(username, at)`];
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
    // one round trip, not ninety: every cold isolate runs this, and D1 is a
    // network away — statement by statement it took 20 s on the live portal
    await db.batch(stmts.map(s => db.prepare(s)));
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
