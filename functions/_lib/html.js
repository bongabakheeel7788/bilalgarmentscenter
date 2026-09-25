// The shell every page shares, and the small pieces (a product card, a grid).
// Server-rendered so a forwarded link previews with the real photo and price
// and the page reads on a slow phone before any script runs; the script then
// adds the cart, the filters and the search.
import { money, priceLabel, productAvailability, groupsOf, ageName, FOR_GROUPS } from './catalogue.js';   // P136: groupsOf, ageName; P139: FOR_GROUPS
import { SWATCHES, iconSvg } from './kind-icons.js';   // P139

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = s => esc(s);
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');

export function waLink(store, text) {
  const n = store.whatsapp_intl || String(store.whatsapp || '').replace(/^0/, '92').replace(/\D/g, '');
  return `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

export function deliveryLine(store) {
  const free = Number(store.free_delivery_above || 0), charge = Number(store.delivery_charge || 0);
  if (charge <= 0 && free <= 0) return 'Cash on delivery all over Pakistan';
  if (charge <= 0) return 'Free delivery all over Pakistan · cash on delivery';
  if (free > 0) return `Free delivery on orders above ${money(free)} · ${money(charge)} below that · cash on delivery`;
  return `Delivery ${money(charge)} all over Pakistan · cash on delivery`;
}

/**
 * The page shell. `page` names the body class; `og` is { title, description,
 * image, type } for the preview a forwarded link gets; `head` is extra markup.
 */
// Fix 1.0.62 — the script and stylesheet addresses carry a fingerprint of their own contents (worked
// out by the POS at publish, `assets.v` in catalogue.json). Browsers keep these files for four hours;
// with the same address every time, a phone that opened the site before a fix kept running the old
// script. A new fingerprint is a new address, so the fix reaches every phone at once — and a publish
// that changed nothing keeps the same one, so nothing is fetched again for no reason.
export const assetV = cat => (cat && cat.assets && cat.assets.v ? `?v=${encodeURIComponent(cat.assets.v)}` : '');

export function layout(cat, { title, description, canonical, og = {}, head = '', page = '', body, store = cat.store, publicData }) {
  const site = String(store.site_url || '').replace(/\/$/, '');
  // P70 — the words a Google result and a forwarded WhatsApp link show. Only the
  // HOME page takes the shop's own: a product page's title is the product's name,
  // which is already the right answer and must not be overwritten by a slogan.
  const fullTitle = title ? `${title} — ${store.name}`
    : (store.seo_title || `${store.name} — ${store.tagline || ''}`.replace(/ — $/, ''));
  const ogImage = og.image ? (og.image.startsWith('http') ? og.image : `${site}/${og.image.replace(/^\//, '')}`) : `${site}/og-default.png`;
  // P70 — the menu Fahad arranged, or the generated one. An entry pointing at a
  // category or collection that no longer exists is DROPPED, never published as
  // a link that goes nowhere; if that empties the list, the generated menu comes
  // back rather than leaving the site with no menu at all.
  // P136 — the menu is who you are buying for (the groups with something in them), not the categories
  const auto = [{ href: '/new/', label: 'New' },
    ...(cat.groups && cat.groups.length ? cat.groups.map(g => ({ href: `/for/${g.key}/`, label: g.label })) : cat.parents.map(p => ({ href: `/c/${p.slug}/`, label: p.name }))),
    ...cat.collections.slice(0, 3).map(c => ({ href: `/collection/${c.slug}/`, label: c.name }))];
  const live = href => {
    const cm = /^\/collection\/([^/]+)\//.exec(href); if (cm) return cat.collections.some(c => c.slug === cm[1]);
    const fm = /^\/for\/([^/]+)\//.exec(href); if (fm) return !cat.groups || cat.groups.some(g => g.key === fm[1]);   // P136
    const km = /^\/c\/([^/]+)\//.exec(href);
    if (km) return cat.parents.some(p => p.slug === km[1]) || (cat.categories || []).some(c => c.slug === km[1]);
    return true;
  };
  const chosen = Array.isArray(store.menu) ? store.menu.filter(m => m && m.href && m.label && live(m.href)) : [];
  const nav = chosen.length ? chosen : auto;
  const pixel = store.pixel_id ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(store.pixel_id)}');fbq('track','PageView');</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${attr(description || (title ? '' : store.seo_description) || store.tagline || '')}">
${canonical ? `<link rel="canonical" href="${attr(site + canonical)}">` : ''}
<meta property="og:site_name" content="${attr(store.name)}">
<meta property="og:type" content="${attr(og.type || 'website')}">
<meta property="og:title" content="${attr(og.title || fullTitle)}">
<meta property="og:description" content="${attr(og.description || description || store.tagline || '')}">
<meta property="og:image" content="${attr(ogImage)}">
${canonical ? `<meta property="og:url" content="${attr(site + canonical)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#fffdfb">
<meta name="color-scheme" content="light">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"></noscript>
<link rel="preload" href="/css/site.css${assetV(cat)}" as="style">
<link rel="stylesheet" href="/css/site.css${assetV(cat)}">
<script>window.STORE=${json({ name: store.name, whatsapp: store.whatsapp, whatsapp_intl: store.whatsapp_intl, free_delivery_above: Number(store.free_delivery_above || 0), delivery_charge: Number(store.delivery_charge || 0), payment_note: store.payment_note || '', site_url: site, pixel: !!store.pixel_id, agent_codes: [...cat.agentCodes] })};${publicData ? `window.PAGE=${json(publicData)};` : ''}</script>
${pixel}
${head}
</head>
<body class="${attr(page)}">
<a class="skip" href="#main">Skip to content</a>
<header class="hdr">
  <div class="wrap hdr-row">
    ${brandMark(store)}
    <form class="hdr-search" action="/search/" role="search"><input type="search" name="q" placeholder="Search — boys shirt, 3 piece, navy…" aria-label="Search products" autocomplete="off"><button type="submit" aria-label="Search">⌕</button></form>
    <button class="cart-btn" id="cartBtn" aria-label="Cart"><span class="cart-ico">🛍</span><span class="cart-count" id="cartCount" hidden>0</span></button>
  </div>
  <nav class="wrap nav" aria-label="Categories">${nav.map(n => `<a href="${attr(n.href)}">${esc(n.label)}</a>`).join('')}<a href="/all/">Everything</a></nav>
</header>
${bannerStrip(store)}
<main id="main" class="wrap">
${body}
</main>
<footer class="ftr">
  <div class="wrap ftr-grid">
    <div><div class="ftr-brand">${esc(store.name)}</div><p>${esc(store.tagline || '')}</p><p>${esc(store.address || '')}</p>${store.hours ? `<p>${esc(store.hours)}</p>` : ''}</div>
    <div><p><a data-where="footer" href="${attr(waLink(store))}" target="_blank" rel="noopener">WhatsApp ${esc(store.whatsapp || '')}</a></p><p><a href="/track/">Track an order</a></p><p><a href="/visit/">Visit the shop</a></p><p><a href="/new/">New arrivals</a></p></div>
    <div><p>${esc(deliveryLine(store))}</p><p>Exchange within 15 days of delivery — unworn, with the tag.</p><p>We call to confirm every order before it is dispatched.</p>${store.footer_note ? `<p>${esc(store.footer_note)}</p>` : ''}</div>
  </div>
</footer>
<a class="wa-float" data-where="float" href="${attr(waLink(store, `Hi ${store.name}, I have a question.`))}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">💬</a>
<aside class="drawer" id="cart" aria-label="Your cart" hidden>
  <div class="drawer-head"><strong>Your cart</strong><button class="x" id="cartClose" aria-label="Close">✕</button></div>
  <div class="drawer-body" id="cartLines"></div>
  <div class="drawer-foot">
    <div class="row"><span>Subtotal</span><strong id="cartSub">Rs 0</strong></div>
    <div class="muted" id="cartDelivery"></div>
    <a class="btn btn-primary btn-block" href="/checkout/" id="cartCheckout">Checkout</a>
  </div>
</aside>
<div class="backdrop" id="backdrop" hidden></div>
<script src="/js/track.js${assetV(cat)}" defer></script>
<script src="/js/search.js${assetV(cat)}" type="module"></script>
<script src="/js/site.js${assetV(cat)}" type="module"></script>
</body>
</html>`;
}

// ── P68a — the product card ─────────────────────────────────────────────────
// Fahad, 2026-09-14, with a competitor's page: "on the products page show
// available colours and sizes just like the one in the image."
//
// Everything here was already in the published catalogue and simply never drawn:
// each colour with its hex and (once Photo mode has been round the racks) its
// own photograph, every size, and whether each variant is in stock.
//
// A swatch is the COLOUR'S PHOTO where one exists and a clean dot where it does
// not, so the card is right today and gets better every time a colourway is
// photographed — no second design, no empty circles in the meantime.
//
// No struck-through "was" price anywhere (Fahad, 2026-09-14). A strike-through
// against a price nobody ever paid is a lie that costs more than it earns on a
// cash-on-delivery shop, where the whole business runs on the customer trusting
// what they read.
const SWATCH_CAP = 4;

function swatches(p) {
  const cs = (p.colours || []).filter(c => c && String(c.name || '').toLowerCase() !== 'standard');
  if (cs.length < 2) return '';
  const shown = cs.slice(0, SWATCH_CAP), rest = cs.length - shown.length;
  return `<div class="card-sw">${shown.map((c, i) => c.photo
    ? `<button type="button" class="sw sw-img${i === 0 ? ' on' : ''}" data-photo="/${attr(c.photo)}" title="${attr(c.name)}" aria-label="${attr(c.name)}"><img src="/${attr(c.photo)}" alt="" loading="lazy" width="56" height="56"></button>`
    : `<span class="sw sw-dot" title="${attr(c.name)}" aria-label="${attr(c.name)}"><i style="background:${attr(c.hex || '#ddd')}"></i></span>`).join('')}${
    rest > 0 ? `<span class="sw-more">+${rest} more</span>` : ''}</div>`;
}

function sizeRow(p) {
  const sizes = p.sizes || [];
  if (!sizes.length) return '';
  // a size that is gone is GREYED, never hidden: a mother needs to see that the
  // range goes to 32 even when 32 is out, or she assumes you do not stock it
  const live = new Set((p.variants || []).filter(v => v.availability !== 'out').map(v => v.size));
  return `<div class="card-sizes">${sizes.map(z =>
    `<span class="${live.has(z) ? '' : 'is-gone'}"${p.size_ages && p.size_ages[z] ? ` title="fits ${attr(p.size_ages[z])}"` : ''}>${esc(z)}</span>`).join('')}</div>`;
}

export function card(p) {
  const av = productAvailability(p);
  const alt = (p.colours || []).map(c => c.photo).filter(Boolean).filter(x => x !== p.cover)[0] || null;
  // P136 — the age range, short: '2 Years–10 Years' reads '2–10 yrs', 'Newborn–2 Years' reads 'Newborn–2 yrs'
  const shortAge = s => String(s).replace(/ Years?$/, ' yrs').replace(/ Months?$/, ' mo');
  const [ra, rb] = String(p.age_range || '').split('–');
  const fits = !p.age_range ? '' : !rb ? shortAge(ra) : (/^\d+ /.test(ra) && ra.replace(/^\d+ /, '') === rb.replace(/^\d+ /, '')) ? ra.split(' ')[0] + '–' + shortAge(rb) : shortAge(ra) + '–' + shortAge(rb);
  return `<div class="card${av === 'out' ? ' is-out' : ''}" data-code="${attr(p.code)}" data-for="${attr(groupsOf(p).join(' '))}">
  <a class="card-img" href="/p/${attr(p.slug)}/" aria-label="${attr(p.name)}">
    ${p.cover ? `<img class="card-photo" src="/${attr(p.cover)}" alt="${attr(p.name)}" loading="lazy" width="600" height="750">` : '<div class="noimg"></div>'}
    ${alt ? `<img class="card-photo-alt" src="/${attr(alt)}" alt="" loading="lazy" width="600" height="750">` : ''}
    ${p.is_new ? '<span class="badge">New</span>' : ''}${av === 'out' ? '<span class="badge badge-out">Sold out</span>' : av === 'few' ? '<span class="badge badge-few">Few left</span>' : ''}${fits ? `<span class="card-fits">${esc(fits)}</span>` : ''}</a>
  ${swatches(p)}
  <a class="card-body" href="/p/${attr(p.slug)}/">
    <div class="card-name">${esc(p.name)}</div>
    <div class="card-price">${esc(priceLabel(p))}</div>
    ${sizeRow(p)}
  </a>
</div>`;
}

/** a grid with the filter bar the script drives; each card carries what the filters need */
export function grid(products, { id = 'grid', filters = true, empty = 'Nothing here yet — new pieces arrive every week.', ageGroups = [], ageChips = false } = {}) {
  if (!products.length) return `<div class="empty">${esc(empty)}</div>`;
  const sizes = [...new Set(products.flatMap(p => p.sizes || []))];
  const colours = [...new Set(products.flatMap(p => (p.colours || []).map(c => c.name).filter(n => n.toLowerCase() !== 'standard')))];
  // P56a — age, type and season: a dropdown each, only when the grid has more than one value
  const SEASON = { SUMMER: 'Summer', PRE_WINTER: 'Pre Winter', WINTER: 'Winter', ALL: 'All seasons' };   // P125 — matches the POS list
  // Fix 1.0.62 — the Age dropdown kept a piece only when its YOUNGEST age was exactly the one picked:
  // "4 Years" on the boys page left 1 piece while the age chips said 23 fit. It now uses the chips'
  // rule — a piece shows when any of its sizes fits — with the shop's own age list as the choices,
  // only the ages these pieces cover. A page that already has age chips does not get a second age control.
  const covers = (a) => products.some(p => Object.values(p.size_months || {}).some(([lo, hi]) => a.months >= lo && a.months <= hi));
  const ages = ageChips ? [] : (ageGroups || []).filter(covers);
  const types = [...new Set(products.map(p => p.product_type).filter(Boolean))];
  const seasons = [...new Set(products.map(p => p.season).filter(Boolean))];
  const data = products.map(p => ({ code: p.code, sizes: (p.variants || []).filter(v => v.availability !== 'out').map(v => v.size), colours: (p.colours || []).map(c => c.name), price: p.price_min, at: p.first_published || '', av: productAvailability(p),
    age: p.age_group || '', type: p.product_type || '', season: p.season || '',
    am: Object.values(p.size_months || {}), kind: p.category || '', fs: Object.values(p.size_free || {}) }));   // P136
  return `${filters ? `<div class="filters" data-grid="${attr(id)}">
    <button type="button" class="f-toggle" data-ftoggle aria-expanded="false">&#9776; Filter</button>
    <span class="f-count" data-count>${products.length} product${products.length === 1 ? '' : 's'}</span>
    <div class="f-controls">
    ${ages.length > 1 ? `<select data-f="age" aria-label="Age"><option value="">Any age</option>${ages.map(a => `<option value="${attr(String(a.months))}">${esc(a.name)}</option>`).join('')}</select>` : ''}
    ${types.length > 1 ? `<select data-f="type" aria-label="Type"><option value="">Any type</option>${types.map(s => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
    <select data-f="size" aria-label="Size"><option value="">Any size</option>${sizes.map(s => `<option>${esc(s)}</option>`).join('')}</select>
    ${colours.length ? `<select data-f="colour" aria-label="Colour"><option value="">Any colour</option>${colours.map(s => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
    ${seasons.length > 1 ? `<select data-f="season" aria-label="Season"><option value="">Any season</option>${seasons.map(s => `<option value="${attr(s)}">${esc(SEASON[s] || s)}</option>`).join('')}</select>` : ''}
    <select data-f="sort" aria-label="Sort"><option value="new">Newest first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>
    <label class="chk"><input type="checkbox" data-f="instock"> In stock only</label>
    </div>
  </div>` : ''}
  <div class="grid" id="${attr(id)}" data-items='${attr(JSON.stringify(data))}'>${products.map(card).join('')}</div>`;
}

export function section(title, inner, more) {
  return `<section class="sec"><div class="sec-head"><h2>${esc(title)}</h2>${more ? `<a href="${attr(more.href)}">${esc(more.label)} →</a>` : ''}</div>${inner}</section>`;
}

export function notFound(cat, what = 'That page is not here') {
  return layout(cat, { title: 'Not found', page: 'p-404', body: `<div class="empty"><h1>${esc(what)}</h1><p>It may have sold out or moved. <a href="/">Start from the home page</a> or <a href="/new/">see what is new</a>.</p></div>` });
}

// ── P68b — the home page's furniture ────────────────────────────────────────
// Fahad, 2026-09-14: "we need to improve our website a lot &mdash; if you can make
// it look more premium then please do that as well." Built with FALLBACKS on his
// instruction ("build it now with fallbacks"), because 5 of 237 products have a
// photograph today and the rest arrive as Photo mode walks the racks. Every
// piece below degrades on its own: band of four → one picture → none, and the
// page is never broken, only plainer.

/** the three things that actually sell a cash-on-delivery shop */
export function promiseRow(store, { compact = false } = {}) {
  const w = Array.isArray(store.promises) && store.promises.length === 3 ? store.promises : null;
  const rows = [
    // P70 — the FIRST one's words are always the delivery rules, never Fahad's
    // free text: a promise that can be edited into disagreeing with what the
    // checkout actually charges is a promise that will one day be a refund.
    ['\u{1F4B5}', (w && w[0].title) || 'Cash on delivery', deliveryLine(store)],
    ['\u{1F4DE}', (w && w[1].title) || 'We call first', (w && w[1].text) || 'Every order is confirmed by phone before it leaves the shop.'],
    ['\u{1F501}', (w && w[2].title) || '15-day exchange', (w && w[2].text) || 'Wrong size? Exchange within 15 days of delivery, tag on.'],
  ];
  return `<section class="promise${compact ? ' promise-sm' : ''}">${rows.map(([ico, t, sub]) =>
    `<div><span class="pr-ico" aria-hidden="true">${ico}</span><strong>${esc(t)}</strong>${compact ? '' : `<span>${esc(sub)}</span>`}</div>`).join('')}</section>`;
}

/** category tiles — a picture to point at, not a list of words to read */
// ── P139 — the homepage tiles ─────────────────────────────────────────────────
// Every group (Boys, Girls, Gents, Ladies, Accessories) as a heading and a row of tiles, one per kind the shop
// sells in it: a coloured square with a line icon, the short name, and the age (children) or the sizes
// (adults) underneath — worked out from the pieces. Name, icon and colour are the shop's choice on the POS
// (Website ▸ The site itself ▸ Homepage tiles). A kind with nothing online yet still shows, marked
// "Coming soon", and asks on WhatsApp instead of opening an empty page (Fahad: "show tile now with coming soon").
const yrs = m => { const y = m / 12; return Number.isInteger(y) ? String(y) : y.toFixed(1).replace(/\.0$/, ''); };
export function kindSpan(k) {
  if (k.months) {
    const [lo, hi] = k.months;
    if (lo >= 12 && hi >= 12) return lo === hi ? `${yrs(lo)} yrs` : `${yrs(lo)}–${yrs(hi)} yrs`;
    if (hi < 12) return lo === hi ? (lo === 0 ? 'newborn' : `${lo} mo`) : `${lo === 0 ? 'newborn' : lo}–${hi} mo`;
    return `${lo === 0 ? 'newborn' : lo + ' mo'}–${yrs(hi)} yrs`;
  }
  if (k.sizes && k.sizes.length) return k.sizes.length > 1 ? `${k.sizes[0]}–${k.sizes[k.sizes.length - 1]}` : `size ${k.sizes[0]}`;
  return '';
}
export function kindTiles(cat) {
  const kinds = cat.kinds || [];
  if (!kinds.length) return '';
  const store = cat.store || {};
  const live = new Set((cat.groups || []).map(g => g.key));
  return `<div class="kinds">${FOR_GROUPS.map(g => {
    const mine = kinds.filter(k => k.group === g.key);
    if (!mine.length) return '';
    const all = live.has(g.key) ? `<a class="kg-all" href="/for/${attr(g.key)}/">All ${esc(g.label.toLowerCase())}<span aria-hidden="true"> →</span></a>` : '';
    return `<section class="kg" data-for="${attr(g.key)}" aria-labelledby="kg-${attr(g.key)}">
      <div class="kg-head"><h2 id="kg-${attr(g.key)}">${esc(g.label)}</h2>${all}</div>
      <div class="kt-row">${mine.map(k => {
        const [tint, ink] = SWATCHES[k.colour] || SWATCHES.blue;
        const span = kindSpan(k);
        const soon = !k.online;
        const href = soon ? waLink(store, `Salam! Do you have ${k.name.toLowerCase()} for ${g.key === 'accessories' ? 'the house' : g.label.toLowerCase()}?`)
          : k.href || `/for/${g.key}/?kind=${encodeURIComponent(k.category)}`;          // P141 — a deal's tile opens its pack page
        return `<a class="kt${soon ? ' is-soon' : ''}" href="${attr(href)}"${soon ? ' target="_blank" rel="noopener" data-where="tile"' : ''} style="--kt-tint:${tint};--kt-ink:${ink}">
          <span class="kt-sw">${iconSvg(k.icon, ink, 34)}${soon ? '<span class="kt-soon">Coming soon</span>' : k.badge ? `<span class="kt-soon kt-deal">${esc(k.badge)}</span>` : ''}</span>
          <span class="kt-name">${esc(k.name)}</span>${span ? `<span class="kt-age">${esc(span)}</span>` : ''}</a>`;
      }).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}
/** a row of chips that filters the grid `gridId` by `field`; scrolls sideways on a phone, never wraps into a wall */
export function chipRow({ title, field, gridId = 'grid', options, any = 'Any' }) {
  if (!options.length) return '';
  return `<div class="for-chips" data-grid="${attr(gridId)}" data-f="${attr(field)}">
    <div class="for-chips-title">${esc(title)}</div>
    <div class="chips" role="group" aria-label="${attr(title)}">
      <button type="button" class="chip on" data-v="">${esc(any)}</button>
      ${options.map(o => `<button type="button" class="chip" data-v="${attr(o.value)}">${esc(o.label)}${o.count ? `<small>${o.count}</small>` : ''}</button>`).join('')}
    </div></div>`;
}

export function catTiles(cat) {
  const shotFor = parent => {
    const p = cat.products.find(x => x.cover && (x.category_parent || x.category) === parent.name);
    return p ? p.cover : null;
  };
  return `<div class="cat-grid">${cat.parents.map(p => {
    const shot = shotFor(p);
    return `<div class="cat-block${shot ? ' has-img' : ''}">
      <a class="cat-parent" href="/c/${attr(p.slug)}/">${shot ? `<span class="cat-img"><img src="/${attr(shot)}" alt="" loading="lazy" width="400" height="400"></span>` : ''}<span class="cat-name">${esc(p.name)}</span></a>
      ${p.children.length ? `<div class="cat-kids">${p.children.map(c => `<a class="cat-child" href="/c/${attr(c.slug)}/">${esc(c.name)}</a>`).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ── P68c — the product page's buy bar ───────────────────────────────────────
// On a phone the Add to cart button scrolls away the moment you start reading,
// and the reading is what decides the sale. This slim bar takes its place: the
// price, the size you chose, and the same button. site.js shows it only once the
// real one has gone, so on a laptop it never appears at all.
export function buyBar(p) {
  return `<div class="buybar" id="buyBar" hidden>
    <div class="bb-text"><strong id="bbPrice">${esc(priceLabel(p))}</strong><span id="bbSize">Choose a size</span></div>
    <button class="btn btn-primary" id="bbAdd">Add to cart</button>
  </div>`;
}

// ── P70 — the header's mark, the banner ─────────────────────────────────────
// Fahad chose PRESETS over free positioning, and this is why: a logo nudged 3px
// on a laptop is 30px off on a phone, and nobody sees that before a customer
// does. Three arrangements, three sizes, and every one of them laid out here
// once, where it can be looked at.
export function brandMark(store) {
  const style = store.logo && ['LOGO', 'BOTH'].includes(store.logo_style) ? store.logo_style : 'WORDMARK';
  const size = ['S', 'M', 'L'].includes(store.logo_size) ? store.logo_size : 'M';
  if (style === 'WORDMARK') return `<a class="brand" href="/">${esc(store.name)}</a>`;
  const img = `<img class="brand-logo" src="/${attr(store.logo)}" alt="${attr(store.name)}" height="40">`;
  return `<a class="brand brand-has-logo br-${attr(size.toLowerCase())}${style === 'LOGO' ? ' brand-logo-only' : ''}" href="/">${img}${
    style === 'BOTH' ? `<span class="brand-name">${esc(store.name)}</span>` : ''}</a>`;
}

/**
 * The strip under the header: the shop's announcement while it is running, and
 * the delivery line the rest of the time.
 *
 * The dates are read HERE, as the page is served — not baked in at publish. That
 * is the whole point of the feature: "Eid sale until the 18th" takes itself down
 * on the 19th whether or not anybody publishes anything, and a stale banner is
 * worse than no banner at all.
 */
export function bannerStrip(store, today = null) {
  const b = store.banner;
  const day = today || new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   // the shop's own day, Asia/Karachi
  const running = b && b.text && b.on !== false && (!b.from || b.from <= day) && (!b.to || b.to >= day);
  if (!running) return `<div class="strip"><div class="wrap">${esc(deliveryLine(store))}</div></div>`;
  const inner = `<strong>${esc(b.text)}</strong>`;
  return `<div class="strip strip-note"><div class="wrap">${b.href ? `<a href="${attr(b.href)}">${inner}</a>` : inner}</div></div>`;
}
