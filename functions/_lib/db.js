// D1 (SQLite) — the orders waiting for the shop. The schema is created on
// first use, so a fresh database needs no migration step; the POS is the
// record once it has pulled an order, D1 keeps it for the tracking page.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'NEW',
    source TEXT NOT NULL DEFAULT 'WEB',
    name TEXT NOT NULL, phone TEXT NOT NULL, alt_phone TEXT,
    address TEXT, city TEXT, province TEXT, note TEXT,
    delivery TEXT NOT NULL DEFAULT 'DELIVERY',
    ref_code TEXT, ref_known INTEGER NOT NULL DEFAULT 0,
    prepaid_ref TEXT,
    utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, campaign TEXT, landing TEXT,
    subtotal_paisa INTEGER NOT NULL, delivery_paisa INTEGER NOT NULL, total_paisa INTEGER NOT NULL,
    ip TEXT, ua TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    acked_at TEXT, status_updated_at TEXT, tracking_no TEXT, courier TEXT, tracking_url TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL, code TEXT NOT NULL, slug TEXT, name TEXT NOT NULL,
    size TEXT, colour TEXT, price_paisa INTEGER NOT NULL, qty INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS order_lines_order ON order_lines(order_id)`,
  `CREATE INDEX IF NOT EXISTS orders_phone_created ON orders(phone, created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_ip_created ON orders(ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS blocked_phones (phone TEXT PRIMARY KEY, reason TEXT, added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
];
let ready = null;
export function ensureSchema(db) {
  if (!ready) ready = (async () => { for (const s of SCHEMA) await db.prepare(s).run(); })().catch(e => { ready = null; throw e; });
  return ready;
}

export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

/** 03xx xxxxxxx in every spelling → 03xxxxxxxxx; null when it is not a Pakistani mobile */
export function normalisePhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = '0' + d.slice(4);
  else if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2);
  return /^03\d{9}$/.test(d) ? d : null;
}

export const orderNo = id => 'WEB-' + String(id).padStart(6, '0');

/** the POS speaks with a shared secret; compare without leaking its length in timing */
export function posAuthorised(context) {
  const want = context.env.STORE_ORDERS_TOKEN || '';
  const got = (context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!want || want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export async function orderWithLines(db, where, params) {
  const o = await db.prepare(`SELECT * FROM orders WHERE ${where}`).bind(...params).first();
  if (!o) return null;
  const { results } = await db.prepare(`SELECT * FROM order_lines WHERE order_id = ? ORDER BY id`).bind(o.id).all();
  return { ...o, lines: results || [] };
}
