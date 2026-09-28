// Every HTML page of the site, rendered from the catalogue.
import { layout, card, grid, section, esc, attr, waLink, notFound, deliveryLine, promiseRow, catTiles, buyBar, kindTiles, chipRow, freeFrom } from './html.js';
import { money, priceLabel, productsIn, categoryTitle, productAvailability, realColours, groupsOf, FOR_GROUPS } from './catalogue.js';
import { SWATCHES, iconSvg } from './kind-icons.js';   // P141 — a deal without a photo shows its tile's icon
import { productText, productLd, breadcrumbLd, storeLd, itemListLd, listIntro, ldTag, clip } from './seo.js';   // P164

const byNewest = (a, b) => String(b.first_published || '').localeCompare(String(a.first_published || '')) || a.name.localeCompare(b.name);

// P154 — "show highly matching items under the products page" (Fahad, 2026-09-27). A match is SCORED, not
// "same category, newest four": who it is for, the ages it fits, the kind, the fabric, the season, the
// price, the set it comes as, and whether a customer can see a photo of it. A piece sold out in every size is never offered.
// `same` true: more of the same kind. `same` false: other kinds for the SAME CHILD — matched by the months each
// piece fits, never by a size's name (rule 12: one maker's Small is not another's).
export function recommend(cat, p, { same, exclude = new Set(), n = 8, groups: known = null }) {
  const groups = known || groupsOf(p);
  const ages = Array.isArray(p.age_months) ? p.age_months : null;
  const mid = x => (Number(x.price_min || 0) + Number(x.price_max || x.price_min || 0)) / 2;
  const pm = mid(p);
  const kind = x => `${x.category_parent || ''}\u0000${x.category || ''}`;
  const out = [];
  for (const x of (cat.listed || cat.products || [])) {
    if (x.code === p.code || x.slug === p.slug || exclude.has(x.code)) continue;
    if (!(x.variants || []).some(v => v.availability !== 'out')) continue;
    const xg = groupsOf(x);
    // who it is for must MATCH. A piece with nobody set is offered only beside another with nobody set: since P110 the
    // category is a type ("Pants"), not a person, so its parent is no stand-in — null === null matched everyone.
    const who = groups.length ? xg.some(g => groups.includes(g)) : !xg.length;
    if (!who) continue;
    if (same !== (kind(x) === kind(p))) continue;
    let s = 0;
    const xa = Array.isArray(x.age_months) ? x.age_months : null;
    if (ages && xa) {
      const overlap = Math.min(ages[1], xa[1]) - Math.max(ages[0], xa[0]);
      if (overlap < 0) continue;                             // a frock for 10–14 is no match for a 1–4-year-old
      s += 3 + Math.min(2, overlap / 12);
    }
    if (p.set_contents && x.set_contents === p.set_contents) s += 1;   // "Shirt + Pant" beside "Shirt + Pant"
    if (p.fabric && x.fabric === p.fabric) s += 1;
    if (p.season && x.season && (x.season === p.season || x.season === 'ALL' || p.season === 'ALL')) s += 0.5;
    if (pm > 0 && Math.abs(mid(x) - pm) / pm <= 0.3) s += 1;
    if (x.cover) s += 1.5;
    if (x.is_new) s += 0.3;
    out.push({ x, s });
  }
  return out.sort((a, b) => b.s - a.s || byNewest(a.x, b.x)).slice(0, n).map(o => o.x);
}
/** the row of recommendations: two across on a phone that scroll sideways, four across on a laptop */
const recRow = (title, items) => items.length ? section(title, `<div class="grid grid-row rec-row">${items.map(card).join('')}</div>`) : '';
/** what the second row is called: the ages it fits, else who it is for ("For boys and girls" for a unisex piece) */
const forWhom = (p, known = null) => {
  if (p.age_range) return `More for ${p.age_range}`;
  const g = known || groupsOf(p);
  if (g.includes('boys') && g.includes('girls')) return 'For boys and girls';
  return (FOR_GROUPS.find(x => g.includes(x.key)) || {}).title || 'You may also like';
};
// P154 — "it takes 3–5 days to deliver, Sunday is off" (Fahad, 2026-09-27). What the page says before its script
// runs; site.js turns it into dates ("Wed 1 Oct – Fri 3 Oct"), counted from today, Sundays skipped.
export const ETA_TEXT = 'Delivered in 3–5 working days (Sundays not counted).';
const etaLine = (cls = 'eta') => `<p class="${cls}" data-eta>${esc(ETA_TEXT)}</p>`;
// Fix 1.0.60 — search results, the checkout, the thanks page and tracking are nobody's landing page;
// robots.txt already keeps crawlers off three of them, the tag keeps a crawler that got a link honest
const NOINDEX = '<meta name="robots" content="noindex">';

export function home(cat) {
  const store = cat.store;
  const listed = cat.listed || cat.products;   // P143: the pack cards are listed like products
  const fresh = listed.filter(p => p.is_new).sort(byNewest);
  const hero = [...fresh, ...listed.slice().sort(byNewest)].find(p => p.cover) || null;   // the picture a shared link shows
  const HOME_MAX = 12;                       // the front page is a shop window, not the stockroom
  const everything = listed.slice().sort(byNewest);
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
  return layout(cat, { title: '', description: `${store.tagline || ''} Order online, cash on delivery.`, canonical: '/', page: 'p-home', body, og: { image: hero && hero.cover },
    head: ldTag(storeLd(store)) });   // P164
}

export function listing(cat, { title, products, canonical, description, intro, crumbs }) {
  // P164 — every listing says what is in it (how many, the prices, the ages) and tells Google the same, in order
  const auto = listIntro(cat, products);
  const trail = crumbs || [{ name: 'Home', href: '/' }, { name: title, href: canonical }];
  const body = `<div class="page-head"><h1>${esc(title)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}${auto ? `<p class="list-intro">${esc(auto)}</p>` : ''}</div>${grid(products, { ageGroups: cat.ageGroups })}`;
  return layout(cat, { title, description: description || clip(`${title} at ${cat.store.name}: ${auto || 'new pieces every week.'}`), canonical, page: 'p-list', body, og: { image: (products.find(p => p.cover) || {}).cover },
    head: ldTag(breadcrumbLd(cat.store, trail)) + (products.length ? ldTag(itemListLd(cat.store, products)) : '') });
}

export function newArrivals(cat) {
  return listing(cat, { title: 'New arrivals', products: (cat.listed || cat.products).filter(p => p.is_new).sort(byNewest), canonical: '/new/', intro: `Added in the last ${cat.store.new_days || 30} days.` });
}

export function all(cat) {
  return listing(cat, { title: 'Everything', products: (cat.listed || cat.products).slice().sort(byNewest), canonical: '/all/' });
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
    <h1>${esc(g.title)} <small>${items.length} piece${items.length === 1 ? '' : 's'}</small></h1>${items.length ? `<p class="list-intro">${esc(listIntro(cat, items))}</p>` : ''}</div>
    ${g.byAge ? chipRow({ title: g.ask, field: 'agem', options: ages.map(a => ({ value: String(a.months), label: a.name })), any: 'Any age' }) : ''}
    ${!g.byAge && sizes.length > 1 ? chipRow({ title: g.ask, field: 'size', options: sizes.map(s => ({ value: s, label: s })), any: 'Any size' }) : ''}
    ${kinds.length > 1 ? chipRow({ title: 'What kind?', field: 'kind', options: kinds.map(([k, n]) => ({ value: k, label: k, count: n })), any: 'Everything' }) : ''}
    ${g.byAge ? '<p class="for-note">A piece shows when any of its sizes fits the age you pick.</p>' : ''}
    ${grid(items, { ageGroups: cat.ageGroups, ageChips: g.byAge })}`;
  return layout(cat, { title: g.title, description: clip(`${g.title} at ${cat.store.name}: ${listIntro(cat, items)}`), canonical: `/for/${key}/`, page: 'p-list p-for', body,
    og: { image: (items.find(p => p.cover) || {}).cover }, publicData: { forGroup: key },
    head: ldTag(breadcrumbLd(cat.store, [{ name: 'Home', href: '/' }, { name: g.title, href: `/for/${key}/` }])) + ldTag(itemListLd(cat.store, items)) });   // P164
}

export function category(cat, slug) {
  const products = productsIn(cat, slug);
  if (!products) return null;
  const c = (cat.categories || []).find(x => x.slug === slug);
  const par = c && c.parent ? cat.parents.find(x => x.name === c.parent) : null;
  const crumbs = [{ name: 'Home', href: '/' }, ...(par ? [{ name: par.name, href: `/c/${par.slug}/` }] : []), { name: c ? c.name : categoryTitle(cat, slug), href: `/c/${slug}/` }];   // P164
  return listing(cat, { title: categoryTitle(cat, slug), products: products.sort(byNewest), canonical: `/c/${slug}/`, crumbs });
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
  // P156 — "after the main product photo the next photo that should appear is the size guide" (Fahad, 2026-09-27)
  const galleryShown = photos.length && p.size_guide ? [photos[0], p.size_guide, ...photos.slice(1).filter(x => x !== p.size_guide)] : photos;
  const av = productAvailability(p);
  const url = `${String(store.site_url || '').replace(/\/$/, '')}/p/${p.slug}/`;
  const sizes = p.sizes || [];
  const variantsData = (p.variants || []).map(v => ({ id: v.id, size: v.size, colour: v.colour, price: v.price, availability: v.availability }));
  // P164 — the words (the shop's own, then the facts), the Product data and the trail Google reads
  const text = productText(p, store);
  const ld = productLd(p, store, { photos, url, text: text.all, availability: av });
  const parentCat = p.category_parent ? cat.parents.find(x => x.name === p.category_parent) : null;
  const ownCat = (cat.categories || []).find(c => c.name === p.category && (c.parent || null) === (p.category_parent || null));
  const trail = [{ name: 'Home', href: '/' }, ...(parentCat ? [{ name: parentCat.name, href: `/c/${parentCat.slug}/` }] : []),
    ...(ownCat ? [{ name: ownCat.name, href: `/c/${ownCat.slug}/` }] : []), { name: p.name, href: `/p/${p.slug}/` }];
  // P154 — two rows, each scored (recommend() above). The second used to be "Others in size 24", matched by the
  // size's NAME across every maker and every child — a girls' frock offered gents' trousers in size M. It is now
  // the other kinds that fit the same child. Neither row repeats the other.
  const related = recommend(cat, p, { same: true });
  const shown = new Set([p.code, ...related.map(x => x.code)]);
  const forChild = recommend(cat, p, { same: false, exclude: shown });
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${p.category_parent ? ` › <a href="/c/${attr(cat.parents.find(x => x.name === p.category_parent)?.slug || '')}/">${esc(p.category_parent)}</a>` : ''} › <a href="/c/${attr((cat.categories.find(c => c.name === p.category && (c.parent || null) === (p.category_parent || null)) || {}).slug || '')}/">${esc(p.category)}</a></nav>
<article class="prod" data-code="${attr(p.code)}">
  ${/* P166 — Fahad, 2026-09-28: "make the overall feel of independent product page more premium". On a phone: one
        full-width photo you swipe (every photo is a slide, the size guide second), a counter and dots, share on the
        photo; on a laptop the small photos stay beside it. Every slide is in the page, so Google sees them all. */ ''}
  <div class="gallery">
    <div class="gallery-main">${photos.length ? `<div class="gal-track" id="galTrack">${galleryShown.map((x, i) => `<button type="button" class="gal-slide${x === p.size_guide && i > 0 ? ' is-guide' : ''}" data-i="${i}" aria-label="${i === 0 ? 'See the photo full screen' : x === p.size_guide ? 'Size guide, full screen' : `Photo ${i + 1}, full screen`}"><img${i === 0 ? ' id="mainImg"' : ''} src="/${attr(x)}" alt="${attr(p.name)}${i === 0 ? '' : x === p.size_guide ? ' — size guide' : ` — photo ${i + 1}`}" width="800" height="1000"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}></button>`).join('')}</div>`
      : '<div class="noimg"></div>'}${p.is_new ? '<span class="badge">New</span>' : ''}
      <button type="button" class="gal-share" id="shareBtn" data-url="${attr(url)}" data-title="${attr(p.name)}" aria-label="Share this piece"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button>
      ${galleryShown.length > 1 ? `<span class="gal-count" id="galCount" aria-hidden="true">1 / ${galleryShown.length}</span><div class="gal-dots" id="galDots" aria-hidden="true">${galleryShown.map((x, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}</div>
    ${galleryShown.length > 1 ? `<div class="thumbs">${galleryShown.map((x, i) => x === p.size_guide && i > 0
      ? `<button class="thumb thumb-guide" data-img="/${attr(x)}" data-i="${i}" data-guide="1" aria-label="Size guide"><img src="/${attr(x)}" alt="${attr(p.name)} — size guide" loading="lazy"><span>Size guide</span></button>`
      : `<button class="thumb${i === 0 ? ' active' : ''}" data-img="/${attr(x)}" data-i="${i}" aria-label="Photo ${i + 1}"><img src="/${attr(x)}" alt="${attr(p.name)} — photo ${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''}
  </div>
  <div class="buy">
    <h1>${esc(p.name)}</h1>
    ${p.rating && p.rating.count ? `<a class="buy-rating" href="#reviews"><span class="stars" aria-hidden="true">${'★'.repeat(Math.round(p.rating.avg))}<span class="stars-off">${'★'.repeat(5 - Math.round(p.rating.avg))}</span></span> <b>${esc(p.rating.avg)}</b> <u>${p.rating.count} review${p.rating.count === 1 ? '' : 's'}</u></a>` : ''}
    <div class="buy-price-row"><div class="buy-price" id="price">${esc(priceLabel(p))}</div>${p.age_range ? `<span class="buy-fits">Fits ${esc(p.age_range)}</span>` : ''}</div>
    ${/* P167 — the free-delivery amount where the decision is made, and whether this piece alone reaches it */ ''}${freeFrom(store) ? `<p class="buy-free">${Number(p.price_min) >= freeFrom(store) ? 'This piece gets <b>free delivery</b>' : `<b>Free delivery</b> on orders of ${esc(money(freeFrom(store)))} or more`}</p>` : ''}
    ${av === 'out' ? '<div class="soldout">Sold out — ask on WhatsApp when it is back.</div>' : ''}
    ${colours.length > 1 ? `<div class="opt"><div class="opt-label">Colour <span id="colourName"></span></div><div class="swatches" id="colours">${colours.map((c, i) => `<button class="swatch${i === 0 ? ' active' : ''}" data-colour="${attr(c.name)}" data-photo="${attr(c.photo || '')}" title="${attr(c.name)}" aria-label="${attr(c.name)}"><span style="background:${attr(c.hex || '#ddd')}"></span></button>`).join('')}</div></div>` : colours.length === 1 ? `<div class="opt"><div class="opt-label">Colour <span>· ${esc(colours[0].name)}</span></div></div>` : ''}
    <div class="opt"><div class="opt-label opt-label-row"><span>Size</span>${p.size_guide ? `<a class="size-guide-link" id="sgOpen" href="/${attr(p.size_guide)}" target="_blank" rel="noopener">Size guide</a>` : ''}</div><div class="sizes" id="sizes">${sizes.map(s => {
      // P68c — rendered with its availability ALREADY on it. site.js refines this
      // per colour, but a phone on a slow connection sees the truth immediately
      // instead of every size looking buyable until the script arrives.
      const live = (p.variants || []).filter(v => v.size === s && v.availability !== 'out');
      const few = live.length && live.every(v => v.availability === 'few');
      return `<button class="size${live.length ? (few ? ' is-few' : '') : ' is-out'}"${live.length ? '' : ' disabled'} data-size="${attr(s)}" title="${attr(p.size_ages && p.size_ages[s] ? `fits ${p.size_ages[s]}` : '')}">${esc(s)}${p.size_ages && p.size_ages[s] ? `<small>${esc(p.size_ages[s])}</small>` : ''}</button>`;
    }).join('')}</div><div class="opt-hint" id="sizeHint">${store.show_stock === false ? '' : 'Stock as of the last update from the shop.'}</div></div>
    <button class="btn btn-primary btn-block btn-lg buy-add" id="addBtn" ${av === 'out' ? 'disabled' : ''}>Add to cart</button>
    ${av === 'out' ? '' : etaLine()}
    <div class="buy-actions">
      <a class="btn btn-outline" data-where="product" href="${attr(waLink(store, `Hi, I'm asking about ${p.name} (${p.code}) — ${url}`))}" target="_blank" rel="noopener">Ask on WhatsApp</a>
    </div>
    ${promiseRow(store, { compact: true })}
    ${/* P166 — folding sections: About open, the rest closed. <details> needs no script and keeps every word in the page */ ''}
    <div class="prod-folds">
      <details class="fold prod-about" open><summary><h2 id="aboutH">About this piece</h2></summary><div class="fold-body">${text.own ? `<p>${esc(text.own)}</p>` : ''}<p>${esc(text.facts)}</p></div></details>
      <details class="fold"><summary><h2>Details</h2></summary><div class="fold-body"><dl class="details">
        ${p.fabric ? `<dt>Fabric</dt><dd>${esc(p.fabric)}</dd>` : ''}
        ${p.set_contents ? `<dt>In the set</dt><dd>${esc(p.set_contents)}</dd>` : ''}
        ${p.size_group ? `<dt>Size range</dt><dd>${esc(sizes.map(z => p.size_ages && p.size_ages[z] ? `${z} (${p.size_ages[z]})` : z).join(' · '))}</dd>` : ''}
        ${p.age_group ? `<dt>Age</dt><dd>${esc(p.age_group)}</dd>` : ''}
        ${p.product_type ? `<dt>Type</dt><dd>${esc(p.product_type)}</dd>` : ''}
        ${p.season ? `<dt>Season</dt><dd>${esc({ SUMMER: 'Summer', PRE_WINTER: 'Pre Winter', WINTER: 'Winter', ALL: 'All seasons' }[p.season] || p.season)}</dd>` : ''}
        <dt>Code</dt><dd>${esc(p.code)}</dd>
      </dl></div></details>
      ${p.size_guide ? `<details class="fold"><summary><h2>Size guide</h2></summary><div class="fold-body"><a href="/${attr(p.size_guide)}" target="_blank" rel="noopener" class="fold-guide"><img src="/${attr(p.size_guide)}" alt="${attr(p.name)} — size guide" loading="lazy" width="800" height="1000"></a></div></details>` : ''}
      <details class="fold"><summary><h2>Delivery and exchange</h2></summary><div class="fold-body"><dl class="details">
        <dt>Delivery</dt><dd>${esc(deliveryLine(store))} · 3–5 working days (Sundays not counted)</dd>
        <dt>Payment</dt><dd>Cash on delivery — pay the courier when it arrives.</dd>
        <dt>Before dispatch</dt><dd>We call to confirm every order.</dd>
        <dt>Exchange</dt><dd>Within 15 days of delivery, unworn with the tag.</dd>
      </dl></div></details>
    </div>
  </div>
</article>
${buyBar(p, store)}
<div class="lightbox" id="lightbox" hidden>
  <button class="lb-x" id="lbClose" aria-label="Close">&#10005;</button>
  <button class="lb-nav lb-prev" id="lbPrev" aria-label="Previous photo">&#8249;</button>
  <img id="lbImg" src="" alt="${attr(p.name)}">
  <button class="lb-nav lb-next" id="lbNext" aria-label="Next photo">&#8250;</button>
</div>
${reviewsBlock(cat, p)}
${recRow('More like this', related)}
${recRow(forWhom(p), forChild)}`;
  return layout(cat, { title: p.name, description: clip(text.own ? `${text.own} ${priceLabel(p)}, cash on delivery all over Pakistan.` : text.facts), canonical: `/p/${p.slug}/`, page: 'p-product', body,
    og: { type: 'product', title: `${p.name} — ${priceLabel(p)}`, image: photos[0] }, head: ldTag(ld) + ldTag(breadcrumbLd(store, trail)),
    publicData: { product: { code: p.code, slug: p.slug, name: p.name, cover: p.cover, photos: galleryShown, guide: p.size_guide || null, variants: variantsData, colours: colours.map(c => ({ name: c.name, photo: c.photo })) } } });
}

// ── P165 — reviews (Fahad, 2026-09-28: "online only, approve genuine ones, photos later") ──────────────────────
// Only what the shop approved and published: first name, city, stars, words, date, the shop's reply. The first
// three show; the rest are on the page too (Google reads them) behind "See all". The form checks the number
// against a delivered order on the server — nobody else can post.
const starRow = n => `<span class="stars" aria-hidden="true">${'★'.repeat(Math.round(n))}<span class="stars-off">${'★'.repeat(5 - Math.round(n))}</span></span>`;
const reviewDate = d => { try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return d; } };
export const reviewForm = (code, { compact = false } = {}) => `
  <form class="rv-form" ${compact ? '' : 'id="rvForm" hidden'} data-code="${attr(code)}" novalidate>
    <div class="rv-pick" role="radiogroup" aria-label="Your stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="rv-star" data-star="${n}" role="radio" aria-checked="false" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('')}<span class="rv-pick-word" aria-live="polite"></span></div>
    <label>Your words <span class="muted">(optional)</span><textarea name="text" rows="3" maxlength="600" placeholder="How was the fit, the fabric, the colour?"></textarea></label>
    ${compact ? '' : `<div class="two"><label>First name <input name="name" maxlength="40" autocomplete="given-name"></label><label>City <input name="city" maxlength="40" autocomplete="address-level2"></label></div>
    <label>Mobile number you ordered with <input name="phone" inputmode="tel" autocomplete="tel" placeholder="03xx xxxxxxx" maxlength="16"><small>Only to check the piece reached you — never shown.</small></label>`}
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <div class="co-err" hidden></div>
    <button class="btn btn-primary${compact ? '' : ' btn-block'}" type="submit">Send review</button>
  </form>`;
function reviewsBlock(cat, p) {
  const r = p.rating && p.rating.count ? p.rating : null;
  const list = p.reviews || [];
  const bars = r ? [5, 4, 3, 2, 1].map(n => { const k = (r.dist && r.dist[n]) || 0; return `<div class="rv-bar"><span>${n} ★</span><i><b style="width:${r.count ? Math.round(k / r.count * 100) : 0}%"></b></i><span>${k}</span></div>`; }).join('') : '';
  return `<section class="rv" id="reviews" aria-labelledby="rvH">
  <div class="rv-head"><h2 id="rvH">Reviews${r ? ` <small>(${r.count})</small>` : ''}</h2><button type="button" class="btn btn-outline" id="rvWrite">Write a review</button></div>
  ${r ? `<div class="rv-sum"><div class="rv-avg"><strong>${esc(r.avg)}</strong>${starRow(r.avg)}<small>${r.count} review${r.count === 1 ? '' : 's'} from customers who bought it</small></div><div class="rv-bars">${bars}</div></div>`
    : '<p class="rv-none">No reviews yet. Bought this piece online? Tell other parents how it fits.</p>'}
  ${reviewForm(p.code)}
  ${list.length ? `<div class="rv-list">${list.map((x, i) => `<article class="rv-item"${i >= 3 ? ' hidden' : ''}>
    <div class="rv-top">${starRow(x.stars)}<span class="sr-only">${x.stars} out of 5</span><span class="rv-verified">Verified buyer</span></div>
    ${x.text ? `<p>${esc(x.text)}</p>` : ''}
    <div class="rv-by">${esc(x.name)}${x.city ? ` · ${esc(x.city)}` : ''}${x.date ? ` · ${esc(reviewDate(x.date))}` : ''}</div>
    ${x.reply ? `<div class="rv-reply"><strong>${esc(cat.store.name)}:</strong> ${esc(x.reply)}</div>` : ''}
  </article>`).join('')}</div>${list.length > 3 ? `<button type="button" class="btn btn-outline btn-block" id="rvMore">See all ${list.length} reviews</button>` : ''}` : ''}
</section>`;
}

/** /review/WEB-000123/ — the page a "please rate your order" WhatsApp opens; the number it was placed with unlocks it */
export function reviewOrder(cat, no) {
  const body = `<div class="page-head"><h1>Rate your order</h1><p>Order <strong>${esc(no)}</strong>. Tell other parents how the pieces fit — it takes a minute.</p></div>
<form class="track-form" id="rvOrderForm"><label>Mobile number you ordered with <input name="phone" inputmode="tel" autocomplete="tel" placeholder="03xx xxxxxxx" required maxlength="16"></label><button class="btn btn-primary" type="submit">Show my pieces</button></form>
<div class="co-err" id="rvOrderErr" hidden></div>
<div id="rvOrderOut"></div>`;
  return layout(cat, { title: 'Rate your order', page: 'p-review', body, publicData: { reviewOrder: no, reviewForm: reviewForm('', { compact: true }) }, head: NOINDEX });
}

// P141 — a deal's pack page: one size, six pieces, mixed colours or the customer's own (same price), free
// delivery. The page arrives with the sizes and the price already on it; site.js adds the colour picker.
export function deal(cat, slug) {
  const d = cat.dealBySlug && cat.dealBySlug.get(slug);
  if (!d) return null;
  const store = cat.store;
  const url = `${String(store.site_url || '').replace(/\/$/, '')}/d/${d.slug}/`;
  const prices = d.sizes.map(z => z.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const from = lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
  const any = d.sizes.some(z => z.packs > 0);
  const [tint, ink] = SWATCHES[d.colour] || SWATCHES.blue;
  // P143 — the pack's own photos (cover first), a picture for each theme, a colour's own photo
  const photos = (d.photos && d.photos.length ? d.photos : d.cover ? [d.cover] : []);
  const hexOf = new Map(d.sizes.flatMap(z => z.colours.map(c => [c.name, c.hex])));
  const stripe = names => `<span class="dp-pic dp-stripe" aria-hidden="true">${names.slice(0, 6).map(n => `<i style="background:${attr(hexOf.get(n) || '#ddd')}"></i>`).join('')}</span>`;
  const pic = src => `<span class="dp-pic" aria-hidden="true"><img src="/${attr(src)}" alt="" loading="lazy" width="120" height="150"></span>`;
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › ${esc(d.category)} › ${esc(d.name)}</nav>
<article class="prod deal" data-deal="${attr(d.slug)}">
  <div class="gallery">
    <div class="gallery-main" id="dpMainBox">${photos.length ? `<img id="dpMain" src="/${attr(photos[0])}" alt="${attr(d.name)}" width="800" height="1000" fetchpriority="high">`
      : `<div class="deal-art" style="--kt-tint:${tint};--kt-ink:${ink}">${iconSvg(d.icon, ink, 120)}</div>`}<span class="badge badge-pack">Pack of ${d.pieces}</span></div>
    ${photos.length > 1 ? `<div class="thumbs" id="dpThumbs">${photos.map((x, i) => `<button class="thumb${i === 0 ? ' active' : ''}" data-img="/${attr(x)}" aria-label="Photo ${i + 1}"><img src="/${attr(x)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
  </div>
  <div class="buy">
    <h1>${esc(d.name)}</h1>
    <div class="buy-meta">${d.pieces} pieces, one size${d.choose_own ? ' · mixed colours, or choose your own' : ' · mixed colours'}</div>
    <div class="buy-price" id="price">${esc(from)}</div>
    ${any ? '' : '<div class="soldout">Sold out for now — ask on WhatsApp when it is back.</div>'}
    <div class="opt"><div class="opt-label">Size <span id="dpAge"></span></div><div class="sizes" id="dpSizes">${d.sizes.map(z =>
      `<button class="size${z.packs ? '' : ' is-out'}"${z.packs ? '' : ' disabled'} data-size="${attr(z.size)}" title="${attr(z.age ? `fits ${z.age}` : '')}">${esc(z.size)}${z.age ? `<small>${esc(z.age)}</small>` : ''}</button>`).join('')}</div>
      <div class="opt-hint" id="dpHint">Choose a size. A crossed-out size has fewer than ${d.pieces} pieces left.</div></div>
    <div class="opt" id="dpModeBox" hidden><div class="opt-label">Colours</div>
      <div class="dp-modes" id="dpModes" role="radiogroup" aria-label="Colours">
        <button type="button" class="dp-mode active" data-mode="MIXED" role="radio" aria-checked="true">${photos.length ? pic(photos[0]) : stripe([...hexOf.keys()])}<strong>Mixed</strong><span>We pick</span></button>
        ${d.choose_own ? `<button type="button" class="dp-mode" data-mode="OWN" role="radio" aria-checked="false"><span class="dp-pic dp-own" aria-hidden="true"><i></i><i></i><i></i><i></i></span><strong>Choose my own</strong><span>Same price</span></button>` : ''}
        ${(d.themes || []).map(t => `<button type="button" class="dp-mode" data-mode="THEME" data-theme="${attr(t.name)}" role="radio" aria-checked="false" title="${attr(t.colours.join(', '))}">${t.photo ? pic(t.photo) : stripe(t.colours)}<strong>${esc(t.name)}</strong><span>${t.colours.length} colours</span></button>`).join('')}
      </div>
      <div class="dp-theme-note" id="dpThemeNote" hidden></div>
      <div id="dpOwn" hidden><div class="dp-count" id="dpCount"></div><div class="dp-grid" id="dpGrid"></div></div>
    </div>
    ${/* P143 — on a phone this stays at the bottom of the screen, with the price on it (mobile first) */ ''}
    ${/* P154 — the button is live before a size is chosen: a tap takes her to what is still missing (site.js) */ ''}
    <div class="qty-row dp-buy"><button class="btn btn-primary btn-block" id="dpAdd">Add pack to cart</button></div>
    <p class="dp-promise"><strong>Free delivery · Cash on delivery.</strong> We call to confirm before dispatch.</p>
    ${any ? etaLine() : ''}
    <div class="buy-actions">
      <a class="btn btn-outline" data-where="deal" href="${attr(waLink(store, `Hi, I'm asking about ${d.name} — ${url}`))}" target="_blank" rel="noopener">Ask on WhatsApp</a>
    </div>
    ${promiseRow(store, { compact: true })}
  </div>
</article>
${(() => {
    // P154 — the pack page is the one the ads land on: it recommends too. Its own card (P143) knows who it is for;
    // a pack that is not listed as a product is matched by its kind and the months its sizes fit.
    const months = d.sizes.map(z => z.months).filter(Array.isArray);
    const self = (cat.listed || []).find(x => x.deal && x.slug === d.slug) || { code: 'PACK:' + d.slug, slug: d.slug, category: d.category, category_parent: d.category_parent,
      age_months: months.length ? [Math.min(...months.map(m => m[0])), Math.max(...months.map(m => m[1]))] : null, price_min: lo, price_max: hi, variants: [] };
    // who it is for: the publisher drops a deal's gender, but files its home-page tiles under each group it is for
    const tiles = [...new Set((cat.kinds || []).filter(k => k.href === `/d/${d.slug}/` && k.group).map(k => k.group))];
    const groups = tiles.length ? tiles : groupsOf(self);
    const same = recommend(cat, self, { same: true, groups });
    const other = recommend(cat, self, { same: false, exclude: new Set(same.map(x => x.code)), groups });
    return recRow('More like this', same) + recRow(forWhom(self, groups), other);
  })()}`;
  return layout(cat, { title: d.name, description: `${d.name} — ${d.pieces} pieces, one size, ${from}. Free delivery, cash on delivery all over Pakistan.`, canonical: `/d/${d.slug}/`, page: 'p-product p-deal', body,
    og: { title: `${d.name} — ${from}`, image: photos[0] },
    publicData: { deal: { slug: d.slug, name: d.name, pieces: d.pieces, choose_own: d.choose_own, cover: photos[0] || null, photos, sizes: d.sizes, themes: d.themes || [] } } });
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
    ${/* P154 — on a phone the floating WhatsApp bubble is not shown here (it sat on Place order); this is its way out */ ''}
    <p class="co-help">Questions before you order? <a data-where="checkout" href="${attr(waLink(store, `Hi ${store.name}, I have a question about my order.`))}" target="_blank" rel="noopener">Ask us on WhatsApp</a></p>
  </form>
  <aside class="co-summary" id="coSummary"><h2>Your order</h2><div id="coLines"></div>
    <div class="row"><span>Subtotal</span><strong id="coSub">Rs 0</strong></div>
    <div class="row"><span id="coDelLabel">Delivery</span><strong id="coDel">—</strong></div>
    <div class="row total"><span>Total</span><strong id="coTotal">Rs 0</strong></div>
    <div class="muted small fd" id="coDelNote"></div>
    ${etaLine('eta eta-co')}
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
  ${/* P154 — the number she typed, shown back: a mistyped digit is caught here, not by a call that never connects */ ''}
  <p class="thanks-phone" id="thanksPhone" hidden></p>
  ${etaLine('eta eta-thanks')}
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
  return layout(cat, { title: 'Visit', page: 'p-visit', body, canonical: '/visit/', description: clip(`Visit ${store.name}${store.address ? ` — ${store.address}` : ''}.${store.hours ? ` Open ${store.hours}.` : ''} Or order online, cash on delivery all over Pakistan.`),
    head: ldTag(storeLd(store)) });   // P164
}

export { notFound };
