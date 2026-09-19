// P101 — the traffic dashboard's numbers.
//
// Two databases, one page:
//   ORDERS (bgc-orders) — the visit log P100 writes: who came, from where, what
//                         they did. The denominator nothing else in the system has.
//   DB     (bgc-admin)  — m_online_orders, mirrored from the POS: every web order
//                         WITH ITS FINAL STATUS. Delivered, or returned to sender.
//
// The second is the point. Cash on delivery means a placed order is a promise,
// not money, and a channel sending forty orders of which fifteen come back is
// worse than one sending twenty-five that stick. No third-party analytics tool
// can see that, because the outcome happens weeks later in a different system.
import { T, c, pc, N, F, num, all, batch } from './q.js';
import { SOURCES } from './channel.js';   // the same rules the site uses; the two files are kept identical (test 97be-6)

const DELIVERED = ['DELIVERED', 'COLLECTED'];
const LOST = ['RTO', 'CANCELLED'];

/** P100 stores a search's result count in value_paisa (the receiver multiplies by 100) */
const resultsOf = v => Math.round(num(v) / 100);

/**
 * Everything the page shows, in two round trips — one batch per database.
 * (P96.1's lesson: never a query per card.)
 */
export async function traffic(db, orders, w) {
  const [from, to] = [w.from, w.to];
  const D = `day BETWEEN ?1 AND ?2`;
  const ev = sql => [`${sql}`, from, to];

  const [totalsRows, byChannel, byPaid, funnel, waPlaces, pages, products, searches, devices, apps, countries, series, orderEvents] =
    await batch(orders, [
      ev(`SELECT COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT session) AS sessions,
            SUM(kind = 'view') AS views, SUM(kind = 'wa_click') AS wa, SUM(kind = 'call_click') AS calls,
            SUM(kind = 'directions') AS directions, SUM(kind = 'order') AS orders
          FROM events WHERE ${D}`),
      ev(`SELECT channel, COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT session) AS sessions,
            SUM(kind = 'order') AS orders, SUM(CASE WHEN kind = 'order' THEN value_paisa ELSE 0 END) AS placed_paisa,
            SUM(kind = 'wa_click') AS wa, MAX(paid) AS any_paid
          FROM events WHERE ${D} GROUP BY channel`),
      ev(`SELECT paid, COUNT(DISTINCT session) AS sessions, SUM(kind = 'order') AS orders,
            SUM(CASE WHEN kind = 'order' THEN value_paisa ELSE 0 END) AS placed_paisa
          FROM events WHERE ${D} GROUP BY paid`),
      // the funnel counts SESSIONS, not events: five product views in one visit is one visit
      ev(`SELECT kind, COUNT(DISTINCT session) AS sessions FROM events
          WHERE ${D} AND kind IN ('view','product','add_to_cart','checkout','order') GROUP BY kind`),
      ev(`SELECT COALESCE(NULLIF(label, ''), 'link') AS place, COUNT(*) AS n FROM events
          WHERE ${D} AND kind = 'wa_click' GROUP BY 1 ORDER BY n DESC`),
      ev(`SELECT path, COUNT(*) AS views, COUNT(DISTINCT session) AS sessions FROM events
          WHERE ${D} AND kind = 'view' AND path IS NOT NULL GROUP BY path ORDER BY views DESC LIMIT 20`),
      ev(`SELECT label AS code, COUNT(*) AS views, COUNT(DISTINCT session) AS sessions FROM events
          WHERE ${D} AND kind = 'product' AND label IS NOT NULL GROUP BY label ORDER BY views DESC LIMIT 20`),
      ev(`SELECT label AS term, COUNT(*) AS times, MIN(value_paisa) AS fewest FROM events
          WHERE ${D} AND kind = 'search' AND label IS NOT NULL GROUP BY label ORDER BY times DESC LIMIT 30`),
      ev(`SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT session) AS sessions FROM events WHERE ${D} GROUP BY 1 ORDER BY sessions DESC`),
      ev(`SELECT app, COUNT(DISTINCT session) AS sessions FROM events WHERE ${D} AND app IS NOT NULL AND app <> '' GROUP BY app ORDER BY sessions DESC`),
      ev(`SELECT COALESCE(country, '—') AS country, COUNT(DISTINCT session) AS sessions FROM events WHERE ${D} GROUP BY 1 ORDER BY sessions DESC LIMIT 10`),
      ev(`SELECT day, COUNT(DISTINCT session) AS sessions, SUM(kind = 'order') AS orders,
            SUM(CASE WHEN kind = 'order' THEN value_paisa ELSE 0 END) AS placed_paisa
          FROM events WHERE ${D} GROUP BY day ORDER BY day`),
      // an order event carries the order number AND the session's channel — the
      // attribution the order row itself cannot have (an untagged TikTok tap)
      ev(`SELECT label AS order_no, channel FROM events WHERE ${D} AND kind = 'order' AND label IS NOT NULL`),
    ]);

  // ── the money side: the same orders, as the POS finally saw them ──────────
  const [sold, spendRows] = await batch(db, [[`
    SELECT ${c('o', 'order_no')} AS order_no, ${c('o', 'status')} AS status, ${pc('o', 'total')} AS total_paisa,
           ${c('o', 'utm_source')} AS utm_source, ${c('o', 'campaign')} AS campaign, ${c('o', 'ref_code')} AS ref_code,
           substr(${c('o', 'placed_at')}, 1, 10) AS day
      FROM ${T('online_orders')} o WHERE substr(${c('o', 'placed_at')}, 1, 10) BETWEEN ?1 AND ?2`, from, to],
    // P103 — what the ads cost, entered monthly on the POS and mirrored here
    [`SELECT ${c('a', 'channel')} AS channel, substr(${c('a', 'month')}, 1, 7) AS month, ${pc('a', 'amount')} AS paisa
        FROM ${T('ad_spend')} a WHERE substr(${c('a', 'month')}, 1, 7) BETWEEN substr(?1, 1, 7) AND substr(?2, 1, 7)`, from, to]]);

  const channelOf = new Map(orderEvents.map(r => [String(r.order_no), r.channel]));
  const fallback = s => SOURCES[String(s || '').trim().toLowerCase()] || (s ? String(s) : 'Direct or WhatsApp');

  const money = new Map();                         // channel → { placed, delivered, lost, orders, delivered_orders, lost_orders }
  let untracked = 0;
  const bump = (ch, o) => {
    const m = money.get(ch) || { placed_paisa: 0, delivered_paisa: 0, orders: 0, delivered: 0, lost: 0 };
    m.orders += 1; m.placed_paisa += num(o.total_paisa);
    if (DELIVERED.includes(o.status)) { m.delivered += 1; m.delivered_paisa += num(o.total_paisa); }
    else if (LOST.includes(o.status)) m.lost += 1;
    money.set(ch, m);
  };
  for (const o of sold) {
    const tracked = channelOf.get(String(o.order_no));
    if (!tracked) untracked += 1;                  // placed before P100, or the event never arrived
    bump(tracked || fallback(o.utm_source), o);
  }

  // ── P103 — spend, pro-rated across the days of the period ────────────────
  // Spend is entered by MONTH, because that is how a shop knows what it spent.
  // When the period is not a whole month, a month's spend is spread evenly over
  // its days and the page says so — an approximation named out loud beats a
  // precise-looking number that is quietly wrong.
  const daysIn = ym => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  const overlapDays = ym => {
    const first = ym + '-01', last = ym + '-' + String(daysIn(ym)).padStart(2, '0');
    const a = from > first ? from : first, b = to < last ? to : last;
    if (a > b) return 0;
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3) + 1;
  };
  const spend = new Map();
  let proRated = false;
  for (const r of spendRows) {
    const d = overlapDays(r.month), full = daysIn(r.month);
    if (!d) continue;
    if (d < full) proRated = true;
    spend.set(r.channel, (spend.get(r.channel) || 0) + Math.round(num(r.paisa) * d / full));
  }

  // ── stitch traffic and money into one row per channel ─────────────────────
  const names = new Set([...byChannel.map(r => r.channel), ...money.keys()]);
  const rows = [...names].map(ch => {
    const t = byChannel.find(r => r.channel === ch) || {};
    const m = money.get(ch) || { placed_paisa: 0, delivered_paisa: 0, orders: 0, delivered: 0, lost: 0 };
    const sessions = num(t.sessions);
    const settled = m.delivered + m.lost;
    return {
      channel: ch, paid: !!num(t.any_paid),
      visitors: num(t.visitors), sessions, wa_clicks: num(t.wa),
      orders: m.orders || num(t.orders),
      conversion_pct: sessions ? Math.round((m.orders || num(t.orders)) / sessions * 1000) / 10 : null,
      placed: F(m.placed_paisa), delivered: F(m.delivered_paisa),
      // only orders that have actually finished count towards the return rate —
      // one still on its way is not a success and not a failure yet
      rto_pct: settled ? Math.round(m.lost / settled * 1000) / 10 : null,
      settled, in_flight: m.orders - settled,
      // a dash where nothing was entered: "free" and "we never wrote it down"
      // are different facts and must not look the same
      ...(spend.has(ch) ? {
        spend: F(spend.get(ch)),
        cost_per_order: m.orders ? F(Math.round(spend.get(ch) / m.orders)) : null,
        // the honest one — an advert whose parcels come back has bought nothing
        cost_per_delivered: m.delivered ? F(Math.round(spend.get(ch) / m.delivered)) : null,
        roas: spend.get(ch) ? Math.round(m.delivered_paisa / spend.get(ch) * 100) / 100 : null,
      } : { spend: null, cost_per_order: null, cost_per_delivered: null, roas: null }),
    };
  }).sort((a, b) => Number(b.delivered) - Number(a.delivered) || b.sessions - a.sessions);

  const totals = totalsRows[0] || {};   // batch() answers rows per statement; this one has exactly one
  const step = k => num((funnel.find(r => r.kind === k) || {}).sessions);
  const visits = step('view');
  const stage = (label, n) => ({ label, sessions: n, of_visits_pct: visits ? Math.round(n / visits * 1000) / 10 : null });

  const paidRow = p => byPaid.find(r => num(r.paid) === p) || {};
  return {
    from, to,
    totals: {
      visitors: num(totals.visitors), sessions: num(totals.sessions), views: num(totals.views),
      orders: num(totals.orders), wa_clicks: num(totals.wa), call_clicks: num(totals.calls), directions: num(totals.directions),
      conversion_pct: num(totals.sessions) ? Math.round(num(totals.orders) / num(totals.sessions) * 1000) / 10 : null,
      placed: F(sold.reduce((a, o) => a + num(o.total_paisa), 0)),
      delivered: F(sold.filter(o => DELIVERED.includes(o.status)).reduce((a, o) => a + num(o.total_paisa), 0)),
    },
    channels: rows,
    // orders the shop has that the visit log never saw — placed before P100, or
    // the browser closed before the beacon left. Said out loud, not hidden.
    untracked_orders: untracked,
    spend: { total: F([...spend.values()].reduce((a, v) => a + v, 0)), pro_rated: proRated, any: spend.size > 0 },
    paid: { paid: { sessions: num(paidRow(1).sessions), orders: num(paidRow(1).orders), placed: F(num(paidRow(1).placed_paisa)) },
            organic: { sessions: num(paidRow(0).sessions), orders: num(paidRow(0).orders), placed: F(num(paidRow(0).placed_paisa)) } },
    funnel: [stage('Visited', visits), stage('Looked at a product', step('product')), stage('Added to the cart', step('add_to_cart')),
             stage('Reached checkout', step('checkout')), stage('Ordered', step('order'))],
    whatsapp: waPlaces.map(r => ({ place: r.place, clicks: num(r.n) })),
    pages: pages.map(r => ({ path: r.path, views: num(r.views), sessions: num(r.sessions) })),
    products: products.map(r => ({ code: r.code, views: num(r.views), sessions: num(r.sessions) })),
    // what people asked for and we had none of, first — that is a buying list
    searches: searches.map(r => ({ term: r.term, times: num(r.times), fewest_results: resultsOf(r.fewest) }))
      .sort((a, b) => (a.fewest_results === 0 ? -1 : 0) - (b.fewest_results === 0 ? -1 : 0) || b.times - a.times),
    devices: devices.map(r => ({ device: r.device, sessions: num(r.sessions) })),
    apps: apps.map(r => ({ app: r.app, sessions: num(r.sessions) })),
    countries: countries.map(r => ({ country: r.country, sessions: num(r.sessions) })),
    series: series.map(r => ({ day: r.day, sessions: num(r.sessions), orders: num(r.orders), placed: F(num(r.placed_paisa)) })),
  };
}
