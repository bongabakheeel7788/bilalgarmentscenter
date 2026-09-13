// The shell every page shares, and the small pieces (a product card, a grid).
// Server-rendered so a forwarded link previews with the real photo and price
// and the page reads on a slow phone before any script runs; the script then
// adds the cart, the filters and the search.
import { money, priceLabel, productAvailability } from './catalogue.js';

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
export function layout(cat, { title, description, canonical, og = {}, head = '', page = '', body, store = cat.store, publicData }) {
  const site = String(store.site_url || '').replace(/\/$/, '');
  const fullTitle = title ? `${title} — ${store.name}` : `${store.name} — ${store.tagline || ''}`.replace(/ — $/, '');
  const ogImage = og.image ? (og.image.startsWith('http') ? og.image : `${site}/${og.image.replace(/^\//, '')}`) : `${site}/og-default.png`;
  const nav = [{ href: '/new/', label: 'New' }, ...cat.parents.map(p => ({ href: `/c/${p.slug}/`, label: p.name })), ...cat.collections.slice(0, 3).map(c => ({ href: `/collection/${c.slug}/`, label: c.name }))];
  const pixel = store.pixel_id ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(store.pixel_id)}');fbq('track','PageView');</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${attr(description || store.tagline || '')}">
${canonical ? `<link rel="canonical" href="${attr(site + canonical)}">` : ''}
<meta property="og:site_name" content="${attr(store.name)}">
<meta property="og:type" content="${attr(og.type || 'website')}">
<meta property="og:title" content="${attr(og.title || fullTitle)}">
<meta property="og:description" content="${attr(og.description || description || store.tagline || '')}">
<meta property="og:image" content="${attr(ogImage)}">
${canonical ? `<meta property="og:url" content="${attr(site + canonical)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0f766e">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/css/site.css" as="style">
<link rel="stylesheet" href="/css/site.css">
<script>window.STORE=${json({ name: store.name, whatsapp: store.whatsapp, whatsapp_intl: store.whatsapp_intl, free_delivery_above: Number(store.free_delivery_above || 0), delivery_charge: Number(store.delivery_charge || 0), payment_note: store.payment_note || '', site_url: site, pixel: !!store.pixel_id, agent_codes: [...cat.agentCodes] })};${publicData ? `window.PAGE=${json(publicData)};` : ''}</script>
${pixel}
${head}
</head>
<body class="${attr(page)}">
<a class="skip" href="#main">Skip to content</a>
<header class="hdr">
  <div class="wrap hdr-row">
    <a class="brand" href="/">${esc(store.name)}</a>
    <form class="hdr-search" action="/search/" role="search"><input type="search" name="q" placeholder="Search — boys shirt, 3 piece, navy…" aria-label="Search products" autocomplete="off"><button type="submit" aria-label="Search">⌕</button></form>
    <button class="cart-btn" id="cartBtn" aria-label="Cart"><span class="cart-ico">🛍</span><span class="cart-count" id="cartCount" hidden>0</span></button>
  </div>
  <nav class="wrap nav" aria-label="Categories">${nav.map(n => `<a href="${attr(n.href)}">${esc(n.label)}</a>`).join('')}<a href="/all/">Everything</a></nav>
</header>
<div class="strip"><div class="wrap">${esc(deliveryLine(store))}</div></div>
<main id="main" class="wrap">
${body}
</main>
<footer class="ftr">
  <div class="wrap ftr-grid">
    <div><div class="ftr-brand">${esc(store.name)}</div><p>${esc(store.tagline || '')}</p><p>${esc(store.address || '')}</p>${store.hours ? `<p>${esc(store.hours)}</p>` : ''}</div>
    <div><p><a href="${attr(waLink(store))}" target="_blank" rel="noopener">WhatsApp ${esc(store.whatsapp || '')}</a></p><p><a href="/track/">Track an order</a></p><p><a href="/visit/">Visit the shop</a></p><p><a href="/new/">New arrivals</a></p></div>
    <div><p>${esc(deliveryLine(store))}</p><p>Exchange within 15 days of delivery — unworn, with the tag.</p><p>We call to confirm every order before it is dispatched.</p></div>
  </div>
</footer>
<a class="wa-float" href="${attr(waLink(store, `Hi ${store.name}, I have a question.`))}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">💬</a>
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
<script src="/js/search.js" type="module"></script>
<script src="/js/site.js" type="module"></script>
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
  return `<div class="card${av === 'out' ? ' is-out' : ''}" data-code="${attr(p.code)}">
  <a class="card-img" href="/p/${attr(p.slug)}/" aria-label="${attr(p.name)}">
    ${p.cover ? `<img class="card-photo" src="/${attr(p.cover)}" alt="${attr(p.name)}" loading="lazy" width="600" height="750">` : '<div class="noimg"></div>'}
    ${alt ? `<img class="card-photo-alt" src="/${attr(alt)}" alt="" loading="lazy" width="600" height="750">` : ''}
    ${p.is_new ? '<span class="badge">New</span>' : ''}${av === 'out' ? '<span class="badge badge-out">Sold out</span>' : av === 'few' ? '<span class="badge badge-few">Few left</span>' : ''}</a>
  ${swatches(p)}
  <a class="card-body" href="/p/${attr(p.slug)}/">
    <div class="card-name">${esc(p.name)}</div>
    <div class="card-price">${esc(priceLabel(p))}</div>
    ${sizeRow(p)}
  </a>
</div>`;
}

/** a grid with the filter bar the script drives; each card carries what the filters need */
export function grid(products, { id = 'grid', filters = true, empty = 'Nothing here yet — new pieces arrive every week.' } = {}) {
  if (!products.length) return `<div class="empty">${esc(empty)}</div>`;
  const sizes = [...new Set(products.flatMap(p => p.sizes || []))];
  const colours = [...new Set(products.flatMap(p => (p.colours || []).map(c => c.name).filter(n => n.toLowerCase() !== 'standard')))];
  // P56a — age, type and season: a dropdown each, only when the grid has more than one value
  const SEASON = { SUMMER: 'Summer', WINTER: 'Winter', ALL: 'All seasons' };
  const ages = [...new Set(products.map(p => p.age_group).filter(Boolean))];
  const types = [...new Set(products.map(p => p.product_type).filter(Boolean))];
  const seasons = [...new Set(products.map(p => p.season).filter(Boolean))];
  const data = products.map(p => ({ code: p.code, sizes: (p.variants || []).filter(v => v.availability !== 'out').map(v => v.size), colours: (p.colours || []).map(c => c.name), price: p.price_min, at: p.first_published || '', av: productAvailability(p),
    age: p.age_group || '', type: p.product_type || '', season: p.season || '' }));
  return `${filters ? `<div class="filters" data-grid="${attr(id)}">
    <button type="button" class="f-toggle" data-ftoggle aria-expanded="false">&#9776; Filter</button>
    <span class="f-count" data-count>${products.length} product${products.length === 1 ? '' : 's'}</span>
    <div class="f-controls">
    ${ages.length > 1 ? `<select data-f="age" aria-label="Age"><option value="">Any age</option>${ages.map(s => `<option>${esc(s)}</option>`).join('')}</select>` : ''}
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
