// P92 — the admin portal's D1 (bgc-admin, bound as DB). One SQLite table per
// mirrored table, each row a JSON document keyed by the shop's primary key —
// the receiver never needs to know a column, so a newer POS never breaks an
// older portal. mirror_runs records every push: the "as of" every page shows.
import SPEC from './mirror-spec.js';

export const TABLE = t => 'm_' + t;                       // m_invoices, m_variants …
export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

let ready = null;
export function ensureSchema(db) {
  if (!ready) ready = (async () => {
    const stmts = [`CREATE TABLE IF NOT EXISTS mirror_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        table_name TEXT NOT NULL, rows INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL,
        pos_version TEXT, spec_version INTEGER, sent_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS mirror_runs_received ON mirror_runs(received_at)`];
    for (const t of Object.keys(SPEC.tables)) {
      stmts.push(`CREATE TABLE IF NOT EXISTS ${TABLE(t)} (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT, mirrored_at TEXT NOT NULL)`);
      stmts.push(`CREATE INDEX IF NOT EXISTS ${TABLE(t)}_updated ON ${TABLE(t)}(updated_at)`);
    }
    for (const s of stmts) await db.prepare(s).run();
  })().catch(e => { ready = null; throw e; });
  return ready;
}

/** the shop speaks with its own secret; compared without leaking its length in timing */
export function shopAuthorised(context) {
  const want = context.env.ADMIN_MIRROR_TOKEN || '';
  const got = (context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** when the portal last received anything — the freshness every page shows */
export async function lastPush(db) {
  const r = await db.prepare(`SELECT MAX(received_at) AS at FROM mirror_runs WHERE kind = 'rows'`).first();
  return r && r.at ? r.at : null;
}
