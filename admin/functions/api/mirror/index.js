// POST /api/mirror — the shop pushes; the portal stores. The ONLY write on the
// whole portal, and it accepts only the shop's token. Body, one of:
//   { table, rows: [{ key, updated_at, data }] }   upsert by key
//   { table, reconcile: [key, …] }                delete every key not listed
// A table the spec does not know is refused, so a typo can never create one.
import SPEC from '../../_lib/mirror-spec.js';
import { ensureSchema, json, shopAuthorised, TABLE } from '../../_lib/db.js';

export async function onRequestPost(context) {
  if (!shopAuthorised(context)) return json({ error: 'UNAUTHORISED' }, 401);
  const db = context.env.DB;
  if (!db) return json({ error: 'NO_DATABASE', hint: 'Bind the D1 database bgc-admin as DB on this Pages project.' }, 500);
  await ensureSchema(db);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  const table = String(body.table || '');
  if (!SPEC.tables[table]) return json({ error: 'UNKNOWN_TABLE', table }, 400);
  const t = TABLE(table);
  const now = new Date().toISOString();

  if (Array.isArray(body.rows)) {
    if (body.rows.length > SPEC.batch) return json({ error: 'BATCH_TOO_BIG', max: SPEC.batch }, 400);
    const stmts = [];
    for (const r of body.rows) {
      if (!r || typeof r.key !== 'string' || !r.key || typeof r.data !== 'object') return json({ error: 'BAD_ROW' }, 400);
      stmts.push(db.prepare(`INSERT INTO ${t} (key, data, updated_at, mirrored_at) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, mirrored_at = excluded.mirrored_at`)
        .bind(r.key, JSON.stringify(r.data), r.updated_at || null, now));
    }
    stmts.push(db.prepare(`INSERT INTO mirror_runs (table_name, rows, kind, pos_version, spec_version, sent_at) VALUES (?1, ?2, 'rows', ?3, ?4, ?5)`)
      .bind(table, body.rows.length, String(body.pos_version || ''), Number(body.spec_version) || null, body.sent_at || null));
    await db.batch(stmts);
    return json({ ok: true, table, upserted: body.rows.length });
  }

  if (Array.isArray(body.reconcile)) {
    // keep only what the shop still has; the list is the shop's whole table, so it is authoritative
    const keep = new Set(body.reconcile.map(String));
    const { results } = await db.prepare(`SELECT key FROM ${t}`).all();
    const gone = (results || []).map(r => r.key).filter(k => !keep.has(k));
    const stmts = [];
    for (let i = 0; i < gone.length; i += 100) {
      const chunk = gone.slice(i, i + 100);
      stmts.push(db.prepare(`DELETE FROM ${t} WHERE key IN (${chunk.map(() => '?').join(',')})`).bind(...chunk));
    }
    stmts.push(db.prepare(`INSERT INTO mirror_runs (table_name, rows, deleted, kind, pos_version, spec_version, sent_at) VALUES (?1, ?2, ?3, 'reconcile', ?4, ?5, ?6)`)
      .bind(table, keep.size, gone.length, String(body.pos_version || ''), Number(body.spec_version) || null, body.sent_at || null));
    await db.batch(stmts);
    return json({ ok: true, table, kept: keep.size, deleted: gone.length });
  }
  return json({ error: 'NOTHING_TO_DO' }, 400);
}
