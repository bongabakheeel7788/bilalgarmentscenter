// The POS's side of the road, behind the shared secret STORE_ORDERS_TOKEN:
//   GET  /api/pos/pull?since=<id>   orders newer than the last one it has (≤ 50), with lines
//   POST /api/pos/ack     { ids }    "I have them" — acked_at; D1 keeps them for the tracking page
//   POST /api/pos/status  { no, status, tracking_no?, courier?, tracking_url? }   so the tracking page is honest
//   PUT  /api/pos/blocked { phones: [{ phone, reason }] }   the whole block list, replaced
//   GET  /api/pos/ping                                       are we configured, how many waiting
import { ensureSchema, json, normalisePhone, posAuthorised } from '../../_lib/db.js';

const STATUSES = new Set(['NEW', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'RTO', 'CANCELLED', 'READY', 'COLLECTED']);

export async function onRequest(context) {
  const { env, request, params } = context;
  if (!env.DB) return json({ error: 'NOT_CONFIGURED' }, 503);
  if (!posAuthorised(context)) return json({ error: 'UNAUTHORISED' }, 401);
  const db = env.DB;
  await ensureSchema(db);
  const action = params.action, method = request.method;
  const now = new Date().toISOString();

  if (action === 'ping' && method === 'GET') {
    const w = await db.prepare(`SELECT count(*) AS n FROM orders WHERE acked_at IS NULL`).first();
    return json({ ok: true, waiting: w ? w.n : 0, time: now });
  }
  if (action === 'pull' && method === 'GET') {
    const since = Number(new URL(request.url).searchParams.get('since') || 0);
    const { results: orders } = await db.prepare(`SELECT * FROM orders WHERE id > ? ORDER BY id LIMIT 50`).bind(since).all();
    if (!orders || !orders.length) return json({ orders: [] });
    const ids = orders.map(o => o.id);
    const { results: lines } = await db.prepare(`SELECT * FROM order_lines WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all();
    const byOrder = new Map(ids.map(i => [i, []]));
    for (const l of lines || []) byOrder.get(l.order_id).push(l);
    return json({ orders: orders.map(o => ({ ...o, ip: undefined, ua: undefined, lines: byOrder.get(o.id) })) });
  }
  if (action === 'ack' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 200);
    if (!ids.length) return json({ ok: true, acked: 0 });
    const r = await db.prepare(`UPDATE orders SET acked_at = COALESCE(acked_at, ?) WHERE id IN (${ids.map(() => '?').join(',')})`).bind(now, ...ids).run();
    return json({ ok: true, acked: r.meta ? r.meta.changes : ids.length });
  }
  if (action === 'status' && method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const no = String(b.no || '').toUpperCase(), status = String(b.status || '').toUpperCase();
    if (!/^WEB-\d{6}$/.test(no) || !STATUSES.has(status)) return json({ error: 'BAD_INPUT' }, 400);
    const r = await db.prepare(`UPDATE orders SET status = ?, status_updated_at = ?, tracking_no = COALESCE(?, tracking_no), courier = COALESCE(?, courier), tracking_url = COALESCE(?, tracking_url) WHERE no = ?`)
      .bind(status, now, b.tracking_no ? String(b.tracking_no).slice(0, 40) : null, b.courier ? String(b.courier).slice(0, 40) : null, b.tracking_url ? String(b.tracking_url).slice(0, 300) : null, no).run();
    return json({ ok: true, updated: r.meta ? r.meta.changes : 1 });
  }
  if (action === 'blocked' && method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const phones = (Array.isArray(b.phones) ? b.phones : []).map(x => ({ phone: normalisePhone(typeof x === 'string' ? x : x.phone), reason: typeof x === 'string' ? null : String(x.reason || '').slice(0, 120) })).filter(x => x.phone).slice(0, 5000);
    await db.batch([db.prepare(`DELETE FROM blocked_phones`), ...phones.map(x => db.prepare(`INSERT OR REPLACE INTO blocked_phones (phone, reason) VALUES (?, ?)`).bind(x.phone, x.reason))]);
    return json({ ok: true, blocked: phones.length });
  }
  return json({ error: 'NOT_FOUND' }, 404);
}
