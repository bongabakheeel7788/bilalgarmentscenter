// Every HTML page of the site, rendered from the catalogue.
import { layout, card, grid, section, esc, attr, waLink, notFound, deliveryLine, promiseRow, catTiles, buyBar, kindTiles, chipRow } from './html.js';
import { money, priceLabel, productsIn, categoryTitle, productAvailability, realColours } from './catalogue.js';

const byNewest = (a, b) => String(b.first_published || '').localeCompare(String(a.first_published || '')) || a.name.localeCompare(b.name);
// Fix 1.0.60 — search results, the checkout, the thanks page and tracking are nobody's landing page;
// robots.txt already keeps crawlers off three of them, the tag keeps a crawler that got a link honest
const NOINDEX = '<meta name="robots" content="noindex">';

export function home(cat) {
  const store = cat.store;
  const fresh = cat.products.filter(p => p.is_new).sort(byNewest);
  const hero = [...fresh, ...cat.products.slice().sort(byNewest)].find(p => p.cover) || null;   // the picture a shared link shows
  const HOME_MAX = 12;                       // the front page is a shop window, not the stockroom
  const everything = cat.products.slice().sort(byNewest);
  const body = `
${/* P139 — Fahad, 2026-09-25: "at top show boys and then boys items … and little age underneath them".
      The groups and their kinds ARE the top of the page now; the old "Who are you buying for?" photo strip
      and the headline with its photo band are gone. The headline stays as the page's h1 for search engines. */ ''}
<h1 class="sr-only">${esc(store.hero_headline || store.tagline || 'Children\'s wear, delivered all over Pakistan')}</h1>
${kindTiles(cat)}
${promiseRow(store)}
${fresh.length ? section('New arrivals', `<div class="grid grid-row">${fresh.slice(0, 8).map(card).join('')}</div>`, { href: '/new/', label: 'See all new' }) : ''}
${cat.collections.length ? section('Collections', `<div class="coll-grid">${cat.collections.map(c => `<a class="coll" href="/collection/${attr(c.slug)}/">${c.cover ? `<img src="/${attr(c.cover)}" alt="" loading="lazy">` : '<div class="noimg"></div>'}<div class="coll-text"><strong>${esc(c.name)}</strong>${c.blurb ? `<span>${esc(c.blurb)}</span>` : ''}<em>${c.items.length} piece${c.items.length === 1 ? '' : 's'}</em></div></a>`).join('')}</div>`) : ''}
${section('Shop by category', catTiles(cat))}
${section('Everything', `<div class="grid">${everything.slice(0, HOME_MAX).map(card).join('')}</div>${
  everything.length > HOME_MAX ? `<div class="more-row"><a class="btn btn-outline btn-lg" href="/all/">See everything (${everything.length} pieces)</a></div>` : ''}`,
  everything.length > HOME_MAX ? { href: '/all/', label: 'See everything' } : null)}`;
  return layout(cat, { title: '', description: `${store.tagline || ''} Order online, cash on delivery.`, canonical: '/', page: 'p-home', body, og: { image: hero && hero.cover } });
}

export function listing(cat, { title, products, canonical, description, intro }) {
  const body = `<div class="page-head"><h1>${esc(title)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}</div>${grid(products, { ageGroups: cat.ageGroups })}`;
  return layout(cat, { title, description: description || `${title} at ${cat.store.name} — ${products.length} pieces, cash on delivery.`, canonical, page: 'p-list', body, og: { image: (products.find(p => p.cover) || {}).cover } });
}

export function newArrivals(cat) {
  return listing(cat, { title: 'New arrivals', products: cat.products.filter(p => p.is_new).sort(byNewest), canonical: '/new/', intro: `Added in the last ${cat.store.new_days || 30} days.` });
}

export function all(cat) {
  return listing(cat, { title: 'Everything', products: cat.products.slice().sort(byNewest), canonical: '/all/' });
}

// P136 — a group's page: the age (children) or the size (adults), the kind, then the grid
export function forPage(cat, key) {
  const g = (cat.groups || []).find(x => x.key === key);
  if (!g) return null;
  const items = g.items;
  // the ages the group's pieces actually cover, in the shop's own order
  const ages = g.byAge ? (cat.ageGroups || []).filter(a => items.some(p => Object.values(p.size_months || {}).some(([lo, hi]) => a.months >= lo && a.months <= hi))) : [];
  const sizes = g.byAge ? [] : [...new Set(items.flatMap(p => (p.variants || []).filter(v => v.availability !== 'out').map(v => (p.size_free || {})[v.size] || v.size)))];
  const kinds = [...items.reduce((m, p) => m.set(p.category, (m.get(p.category) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const body = `<div class="page-head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › ${esc(g.title)}</nav>
    <h1>${esc(g.title)} <small>${items.length} piece${items.length === 1 ? '' : 's'}</small></h1></div>
    ${g.byAge ? chipRow({ title: g.ask, field: 'agem', options: ages.map(a => ({ value: String(a.months), label: a.name })), any: 'Any age' }) : ''}
    ${!g.byAge && sizes.length > 1 ? chipRow({ title: g.ask, field: 'size', options: sizes.map(s => ({ value: s, label: s })), any: 'Any size' }) : ''}
    ${kinds.length > 1 ? chipRow({ title: 'What kind?', field: 'kind', options: kinds.map(([k, n]) => ({ value: k, label: k, count: n })), any: 'Everything' }) : ''}
    ${g.byAge ? '<p class="for-note">A piece shows when any of its sizes fits the age you pick.</p>' : ''}
    ${grid(items, { ageGroups: cat.ageGroups, ageChips: g.byAge })}`;
  return layout(cat, { title: g.title, description: `${g.title} at ${cat.store.name} — ${items.length} pieces, cash on delivery all over Pakistan.`, canonical: `/for/${key}/`, page: 'p-list p-for', body,
    og: { image: (items.find(p => p.cover) || {}).cover }, publicData: { forGroup: key } });
}

export function category(cat, slug) {
  const products = productsIn(cat, slug);
  if (!products) return null;
  return listing(cat, { title: categoryTitle(cat, slug), products: products.sort(byNewest), canonical: `/c/${slug}/` });
}

export function collection(cat, slug) {
  const c = cat.collections.find(x => x.slug === slug);
  if (!c) return null;
  return listing(cat, { title: c.name, products: c.items, canonical: `/collection/${slug}/`, intro: c.blurb || '', description: c.blurb || `${c.name} — a set picked by ${cat.store.name}.` });
}

export function product(cat, slug) {
  const p = cat.bySlug.get(slug);
  if (!p) return null;
  const store = cat.store;
  const colours = realColours(p);
  // P130 — the gallery as the shop ordered it: cover, angles, then colour photos; older catalogues carry no list
  const gallery = Array.isArray(p.photos) && p.photos.length ? p.photos.map(x => x.src) : [p.cover, ...colours.map(c => c.photo)];
  const photos = gallery.filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const av = productAvailability(p);
  const url = `${String(store.site_url || '').replace(/\/$/, '')}/p/${p.slug}/`;
  const sizes = p.sizes || [];
  const variantsData = (p.variants || []).map(v => ({ id: v.id, size: v.size, colour: v.colour, price: v.price, availability: v.availability }));
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, productID: p.code, image: photos.map(x => `${String(store.site_url || '').replace(/\/$/, '')}/${x}`), description: [p.category_parent, p.category, p.fabric, p.set_contents].filter(Boolean).join(' · '), brand: { '@type': 'Brand', name: store.name },
    offers: { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: p.price_min, highPrice: p.price_max, offerCount: (p.variants || []).length, availability: av === 'out' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url } };
  const related = cat.products.filter(x => x.code !== p.code && x.category === p.category && (x.category_parent || null) === (p.category_parent || null)).sort(byNewest).slice(0, 4);
  // P68c — a second row by SIZE. On a children's shop the mother who is buying a
  // 24 is very often buying a second 24, and she should not have to go and filter
  // for it. Never repeats anything already in the row above.
  const shown = new Set([p.code, ...related.map(x => x.code)]);
  const alsoSize = sizes.length
    ? cat.products.filter(x => !shown.has(x.code) && (x.variants || []).some(v => v.size === sizes[0] && v.availability !== 'out')).sort(byNewest).slice(0, 4)
    : [];
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${p.category_parent ? ` › <a href="/c/${attr(cat.parents.find(x => x.name === p.category_parent)?.slug || '')}/">${esc(p.category_parent)}</a>` : ''} › <a href="/c/${attr((cat.categories.find(c => c.name === p.category && (c.parent || null) === (p.category_parent || null)) || {}).slug || '')}/">${esc(p.category)}</a></nav>
<article class="prod" data-code="${attr(p.code)}">
  <div class="gallery">
    <div class="gallery-main">${photos.length ? `<button type="button" class="zoom-open" id="zoomOpen" aria-label="See the photo full screen"><img id="mainImg" src="/${attr(photos[0])}" alt="${attr(p.name)}" width="800" height="1000"></button>` : '<div class="noimg"></div>'}${p.is_new ? '<span class="badge">New</span>' : ''}</div>
    ${photos.length > 1 ? `<div class="thumbs">${photos.map((x, i) => `<button class="thumb${i === 0 ? ' active' : ''}" data-img="/${attr(x)}" aria-label="Photo ${i + 1}"><img src="/${attr(x)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
  </div>
  <div class="buy">
    <h1>${esc(p.name)}</h1>
    <div class="buy-meta">${esc(p.code)} · ${esc(p.category_parent ? p.category_parent + ' · ' : '')}${esc(p.category)}</div>
    <div class="buy-price" id="price">${esc(priceLabel(p))}</div>
    ${av === 'out' ? '<div class="soldout">Sold out — ask on WhatsApp when it is back.</div>' : ''}
    ${colours.length > 1 ? `<div class="opt"><div class="opt-label">Colour <span id="colourName"></span></div><div class="swatches" id="colours">${colours.map((c, i) => `<button class="swatch${i === 0 ? ' active' : ''}" data-colour="${attr(c.name)}" data-photo="${attr(c.photo || '')}" title="${attr(c.name)}" aria-label="${attr(c.name)}"><span style="background:${attr(c.hex || '#ddd')}"></span></button>`).join('')}</div></div>` : colours.length === 1 ? `<div class="opt"><div class="opt-label">Colour: ${esc(colours[0].name)}</div></div>` : ''}
    <div class="opt"><div class="opt-label">Size</div><div class="sizes" id="sizes">${sizes.map(s => {
      // P68c — rendered with its availability ALREADY on it. site.js refines this
      // per colour, but a phone on a slow connection sees the truth immediately
      // instead of every size looking buyable until the script arrives.
      const live = (p.variants || []).filter(v => v.size === s && v.availability !== 'out');
      const few = live.length && live.every(v => v.availability === 'few');
      return `<button class="size${live.length ? (few ? ' is-few' : '') : ' is-out'}"${live.length ? '' : ' disabled'} data-size="${attr(s)}" title="${attr(p.size_ages && p.size_ages[s] ? `fits ${p.size_ages[s]}` : '')}">${esc(s)}${p.size_ages && p.size_ages[s] ? `<small>${esc(p.size_ages[s])}</small>` : ''}</button>`;
    }).join('')}</div><div class="opt-hint" id="sizeHint">${store.show_stock === false ? '' : 'Stock as of the last update from the shop.'}</div>
    ${p.size_guide ? `<details class="size-guide"><summary>Size guide</summary><img src="/${attr(p.size_guide)}" alt="Size guide for ${attr(p.name)}" loading="lazy"></details>` : ''}</div>
    <div class="qty-row"><label>Qty <input type="number" id="qty" value="1" min="1" max="10"></label>
      <button class="btn btn-primary" id="addBtn" ${av === 'out' ? 'disabled' : ''}>Add to cart</button></div>
    <div class="buy-actions">
      <a class="btn btn-outline" data-where="product" href="${attr(waLink(store, `Hi, I'm asking about ${p.name} (${p.code}) — ${url}`))}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      <button class="btn btn-outline" id="shareBtn" data-url="${attr(url)}" data-title="${attr(p.name)}">Share</button>
    </div>
    ${promiseRow(store, { compact: true })}
    <dl class="details">
      ${p.fabric ? `<dt>Fabric</dt><dd>${esc(p.fabric)}</dd>` : ''}
      ${p.set_contents ? `<dt>In the set</dt><dd>${esc(p.set_contents)}</dd>` : ''}
      ${p.size_group ? `<dt>Size range</dt><dd>${esc(sizes.map(z => p.size_ages && p.size_ages[z] ? `${z} (${p.size_ages[z]})` : z).join(' · '))}</dd>` : ''}
      ${p.age_group ? `<dt>Age</dt><dd>${esc(p.age_group)}</dd>` : ''}
      ${p.product_type ? `<dt>Type</dt><dd>${esc(p.product_type)}</dd>` : ''}
      ${p.season ? `<dt>Season</dt><dd>${esc({ SUMMER: 'Summer', PRE_WINTER: 'Pre Winter', WINTER: 'Winter', ALL: 'All seasons' }[p.season] || p.season)}</dd>` : ''}
      <dt>Delivery</dt><dd>${esc(deliveryLine(store))}</dd>
      <dt>Exchange</dt><dd>Within 15 days of delivery, unworn with the tag.</dd>
    </dl>
  </div>
</article>
${buyBar(p)}
<div class="lightbox" id="lightbox" hidden>
  <button class="lb-x" id="lbClose" aria-label="Close">&#10005;</button>
  <button class="lb-nav lb-prev" id="lbPrev" aria-label="Previous photo">&#8249;</button>
  <img id="lbImg" src="" alt="${attr(p.name)}">
  <button class="lb-nav lb-next" id="lbNext" aria-label="Next photo">&#8250;</button>
</div>
${related.length ? section('More like this', `<div class="grid grid-row">${related.map(card).join('')}</div>`) : ''}
${alsoSize.length ? section(`Others in size ${esc(sizes[0] || '')}`, `<div class="grid grid-row">${alsoSize.map(card).join('')}</div>`) : ''}`;
  return layout(cat, { title: p.name, description: `${p.name} — ${priceLabel(p)}. ${[p.category_parent, p.category, p.fabric].filter(Boolean).join(', ')}. Cash on delivery all over Pakistan.`, canonical: `/p/${p.slug}/`, page: 'p-product', body,
    og: { type: 'product', title: `${p.name} — ${priceLabel(p)}`, image: photos[0] }, head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    publicData: { product: { code: p.code, slug: p.slug, name: p.name, cover: p.cover, photos, variants: variantsData, colours: colours.map(c => ({ name: c.name, photo: c.photo })) } } });
}

export function search(cat, q) {
  const body = `<div class="page-head"><h1>Search</h1><form class="search-big" action="/search/" role="search"><input type="search" name="q" value="${attr(q)}" placeholder="boys shirt, 3 piece, navy, size 24…" aria-label="Search" autofocus><button class="btn btn-primary" type="submit">Search</button></form></div>
<div id="searchOut">${q ? '<div class="empty">Searching…</div>' : '<p class="muted">Type what you are looking for — words in any order: a name, a colour, a size, a category.</p>'}</div>`;
  return layout(cat, { title: q ? `Search: ${q}` : 'Search', page: 'p-search', body, publicData: { q }, head: NOINDEX });
}

export function checkout(cat, turnstileKey) {
  const store = cat.store;
  const body = `<div class="page-head"><h1>Checkout</h1><p>No account needed. We call this number to confirm before dispatch.</p></div>
<div class="co">
  <form class="co-form" id="coForm" novalidate>
    <fieldset><legend>Your details</legend>
      <label>Full name <input name="name" required autocomplete="name" maxlength="80"></label>
      <label>Mobile number <input name="phone" required inputmode="tel" autocomplete="tel" placeholder="03xx xxxxxxx" maxlength="16"><small>We call this number to confirm the order.</small></label>
      <label>Another number (optional) <input name="alt_phone" inputmode="tel" maxlength="16"></label>
    </fieldset>
    <fieldset><legend>Delivery</legend>
      <div class="radios"><label><input type="radio" name="delivery" value="DELIVERY" checked> Deliver to my address</label><label><input type="radio" name="delivery" value="COLLECT"> I will collect from the shop</label></div>
      <div id="addrBlock">
        <label>Full address <textarea name="address" rows="3" maxlength="400" placeholder="House, street, area, nearest landmark"></textarea></label>
        <div class="two"><label>City <input name="city" list="cities" autocomplete="address-level2" maxlength="60"><datalist id="cities">${['Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Islamabad', 'Gujranwala', 'Multan', 'Peshawar', 'Hyderabad', 'Quetta', 'Sialkot', 'Sargodha', 'Bahawalpur', 'Sukkur', 'Jhang', 'Sheikhupura', 'Larkana', 'Gujrat', 'Mardan', 'Kasur', 'Rahim Yar Khan', 'Sahiwal', 'Okara', 'Wah', 'Dera Ghazi Khan', 'Mirpur Khas', 'Nawabshah', 'Mingora', 'Chiniot', 'Kamoke', 'Hafizabad', 'Sadiqabad', 'Burewala', 'Kohat', 'Khanewal', 'Dera Ismail Khan', 'Turbat', 'Muzaffargarh', 'Abbottabad', 'Mandi Bahauddin', 'Shikarpur', 'Jacobabad', 'Jhelum', 'Khanpur', 'Khairpur', 'Muridke', 'Tandlianwala', 'Samundri', 'Jaranwala', 'Toba Tek Singh', 'Gojra', 'Kamalia', 'Chichawatni', 'Pakpattan', 'Vehari', 'Mianwali', 'Attock', 'Bhakkar', 'Layyah', 'Lodhran', 'Narowal', 'Nankana Sahib', 'Chakwal', 'Muzaffarabad', 'Mirpur AJK', 'Gilgit', 'Skardu'].map(c => `<option value="${attr(c)}">`).join('')}</datalist></label>
        <label>Province <select name="province"><option value="">Choose</option>${['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad', 'Azad Kashmir', 'Gilgit-Baltistan'].map(p => `<option>${p}</option>`).join('')}</select></label></div>
      </div>
      <label>Note for the shop (optional) <input name="note" maxlength="200" placeholder="e.g. call after 5 pm"></label>
    </fieldset>
    <fieldset><legend>Did an agent help you?</legend>
      <label>Referral code (optional) <input name="ref" inputmode="numeric" maxlength="4" pattern="[0-9]{3,4}" placeholder="3 or 4 digits"><small>If someone from ${esc(store.name)} helped you on WhatsApp, enter their code so they are credited.</small></label>
    </fieldset>
    <fieldset><legend>Payment</legend>
      <p class="muted">Cash on delivery — pay the courier when the parcel arrives.</p>
      ${store.payment_note ? `<details><summary>Already paid by bank transfer / JazzCash / Easypaisa?</summary><p class="muted">${esc(store.payment_note)}</p><label>Transaction reference <input name="prepaid_ref" maxlength="60"></label><small>We verify it on the confirmation call; the parcel then goes out with nothing to pay.</small></details>` : ''}
    </fieldset>
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    ${turnstileKey ? `<div class="cf-turnstile" data-sitekey="${attr(turnstileKey)}" data-size="invisible" data-callback="onTurnstile"></div>` : ''}
    <div class="co-err" id="coErr" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" id="coSubmit" type="submit">Place order</button>
    <p class="muted small">By ordering you agree to a confirmation call and to our 15-day exchange policy.</p>
  </form>
  <aside class="co-summary" id="coSummary"><h2>Your order</h2><div id="coLines"></div>
    <div class="row"><span>Subtotal</span><strong id="coSub">Rs 0</strong></div>
    <div class="row"><span id="coDelLabel">Delivery</span><strong id="coDel">—</strong></div>
    <div class="row total"><span>Total</span><strong id="coTotal">Rs 0</strong></div>
    <div class="muted small" id="coDelNote"></div>
  </aside>
</div>`;
  return layout(cat, { title: 'Checkout', page: 'p-checkout', body, head: NOINDEX + (turnstileKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : '') });
}

export function thanks(cat, no) {
  const store = cat.store;
  const body = `<div class="thanks">
  <div class="thanks-ico">✓</div>
  <h1>Order received</h1>
  <p class="thanks-no">Your order number is <strong>${esc(no)}</strong></p>
  <div id="thanksLines"></div>
  <ol class="steps"><li><strong>We call you</strong> on the number you gave, usually within a few hours during shop time, to confirm the pieces and the address.</li><li><strong>We pack and dispatch</strong> by Leopards courier; you get the tracking number on the <a href="/track/">Track</a> page.</li><li><strong>You pay the courier</strong> when it arrives. Wrong size? Exchange within 15 days.</li></ol>
  <div class="thanks-actions"><a class="btn btn-primary" data-where="thanks" href="${attr(waLink(store, `Hi, I have just placed order ${no} on your website.`))}" target="_blank" rel="noopener">Send us the order on WhatsApp</a><a class="btn btn-outline" href="/">Keep browsing</a></div>
</div>`;
  return layout(cat, { title: `Order ${no}`, page: 'p-thanks', body, publicData: { no }, head: NOINDEX });
}

export function track(cat, no) {
  const body = `<div class="page-head"><h1>Track an order</h1><p>Enter the order number from your confirmation and the mobile number you ordered with.</p></div>
<form class="track-form" id="trackForm"><label>Order number <input name="no" value="${attr(no || '')}" placeholder="WEB-000123" required></label><label>Mobile number <input name="phone" inputmode="tel" placeholder="03xx xxxxxxx" required></label><button class="btn btn-primary" type="submit">Track</button></form>
<div id="trackOut"></div>`;
  return layout(cat, { title: 'Track an order', page: 'p-track', body, canonical: '/track/', head: NOINDEX });
}

export function visit(cat) {
  const store = cat.store;
  const body = `<div class="page-head"><h1>Visit the shop</h1></div>
<div class="visit">
  <div><h2>${esc(store.name)}</h2><p>${esc(store.address || '')}</p>${store.hours ? `<p><strong>Hours:</strong> ${esc(store.hours)}</p>` : ''}<p><strong>Phone / WhatsApp:</strong> <a data-where="visit" href="${attr(waLink(store))}">${esc(store.whatsapp || store.phone || '')}</a></p>
  ${store.map_url ? `<p><a class="btn btn-outline" href="${attr(store.map_url)}" target="_blank" rel="noopener">Open in Google Maps</a></p>` : ''}</div>
  <div class="visit-note"><p>Ordered online and chose <em>collect from the shop</em>? Bring your order number; the pieces are kept aside once we have confirmed with you.</p><p>${esc(deliveryLine(store))}</p></div>
</div>`;
  return layout(cat, { title: 'Visit', page: 'p-visit', body, canonical: '/visit/' });
}

export { notFound };
