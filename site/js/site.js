// bilalgarments.center — the cart, the product page, the filters, the search,
// the checkout, the tracking page. No framework; the pages arrive rendered and
// this only adds what needs a hand.
import { matchProduct } from './search.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = window.STORE || {};
const money = n => 'Rs ' + (Number.isInteger(Number(n)) ? Number(n).toLocaleString('en-PK') : Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const pixel = (ev, data) => { if (S.pixel && window.fbq) try { fbq('track', ev, data); } catch { /* ad blocker */ } };
const track = (k, o) => { try { if (window.bgcTrack) window.bgcTrack(k, o); } catch (e) { /* the visit log never breaks a sale */ } };
let toastT;
function toast(msg) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

// ── referral code and campaign, remembered ───────────────────────────────────
(function remember() {
  const q = new URLSearchParams(location.search);
  const ref = (q.get('ref') || '').replace(/\D/g, '');
  if (/^\d{3,4}$/.test(ref)) store.set('bgc_ref', { code: ref, until: Date.now() + 30 * 86400e3 });
  const utm = {};
  for (const k of ['source', 'medium', 'campaign', 'content']) if (q.get('utm_' + k)) utm[k] = q.get('utm_' + k).slice(0, 80);
  if (q.get('c')) utm.c = q.get('c').slice(0, 80);
  if (Object.keys(utm).length) { utm.landing = location.pathname + location.search; try { sessionStorage.setItem('bgc_utm', JSON.stringify(utm)); } catch { /* */ } }
})();
const refCode = () => { const r = store.get('bgc_ref'); return r && r.until > Date.now() ? r.code : ''; };
const utmData = () => { try { return JSON.parse(sessionStorage.getItem('bgc_utm') || '{}'); } catch { return {}; } };

// ── the cart ─────────────────────────────────────────────────────────────────
const cart = {
  lines: store.get('bgc_cart', []),
  save() { store.set('bgc_cart', this.lines); paintCart(); },
  add(l) { const hit = this.lines.find(x => x.variant_id === l.variant_id); if (hit) hit.qty = Math.min(10, hit.qty + l.qty); else this.lines.push(l); this.save(); },
  setQty(id, qty) { const hit = this.lines.find(x => x.variant_id === id); if (!hit) return; hit.qty = Math.max(0, Math.min(10, qty)); if (!hit.qty) this.lines = this.lines.filter(x => x !== hit); this.save(); },
  clear() { this.lines = []; this.save(); },
  subtotal() { return this.lines.reduce((s, l) => s + l.price * l.qty, 0); },
  count() { return this.lines.reduce((s, l) => s + l.qty, 0); },
};
function deliveryCharge(sub, mode) {
  if (mode === 'COLLECT') return 0;
  const free = Number(S.free_delivery_above || 0), ch = Number(S.delivery_charge || 0);
  if (ch <= 0) return 0;
  if (free > 0 && sub >= free) return 0;
  return ch;
}
function deliveryNote(sub) {
  const free = Number(S.free_delivery_above || 0), ch = Number(S.delivery_charge || 0);
  if (ch <= 0) return free > 0 ? '' : 'Delivery charge is confirmed on the call.';
  if (free > 0 && sub >= free) return 'Free delivery — you are above ' + money(free) + '.';
  if (free > 0) return 'Add ' + money(free - sub) + ' more for free delivery.';
  return 'Delivery ' + money(ch) + ' per parcel.';
}
function paintCart() {
  const n = cart.count(), c = $('#cartCount');
  if (c) { c.textContent = n; c.hidden = !n; }
  const box = $('#cartLines');
  if (!box) return;
  box.innerHTML = cart.lines.length ? cart.lines.map(l => `<div class="line">
    ${l.cover ? `<img src="/${esc(l.cover)}" alt="">` : '<div class="noimg" style="width:56px;height:70px;border-radius:8px"></div>'}
    <div><a class="line-name" href="/p/${esc(l.slug)}/">${esc(l.name)}</a><div class="line-meta">${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''} · ${money(l.price)}</div>
      <div class="line-qty"><button data-dec="${l.variant_id}" aria-label="Less">−</button><span>${l.qty}</span><button data-inc="${l.variant_id}" aria-label="More">+</button></div></div>
    <div><div class="line-price">${money(l.price * l.qty)}</div><button class="line-rm" data-rm="${l.variant_id}">Remove</button></div></div>`).join('')
    : '<div class="cart-empty">Your cart is empty.<br><a href="/new/" style="color:var(--accent);font-weight:700">See what is new →</a></div>';
  const sub = cart.subtotal();
  $('#cartSub').textContent = money(sub);
  $('#cartDelivery').textContent = deliveryNote(sub);
  $('#cartCheckout').style.display = cart.lines.length ? '' : 'none';
  $$('[data-dec]', box).forEach(b => b.onclick = () => cart.setQty(Number(b.dataset.dec), (cart.lines.find(x => x.variant_id === Number(b.dataset.dec)) || {}).qty - 1));
  $$('[data-inc]', box).forEach(b => b.onclick = () => cart.setQty(Number(b.dataset.inc), (cart.lines.find(x => x.variant_id === Number(b.dataset.inc)) || {}).qty + 1));
  $$('[data-rm]', box).forEach(b => b.onclick = () => cart.setQty(Number(b.dataset.rm), 0));
}
function openCart(open) { const d = $('#cart'), b = $('#backdrop'); if (!d) return; d.hidden = !open; b.hidden = !open; document.body.style.overflow = open ? 'hidden' : ''; if (open) paintCart(); }
$('#cartBtn') && ($('#cartBtn').onclick = () => openCart(true));
$('#cartClose') && ($('#cartClose').onclick = () => openCart(false));
$('#backdrop') && ($('#backdrop').onclick = () => openCart(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openCart(false); });
paintCart();

// ── product page ─────────────────────────────────────────────────────────────
const P = window.PAGE && window.PAGE.product;
if (P && $('#sizes')) {
  let colour = ($('#colours .swatch.active') || {}).dataset ? $('#colours .swatch.active').dataset.colour : (P.colours[0] ? P.colours[0].name : (P.variants[0] || {}).colour);
  let size = null;
  const variantFor = (s, c) => P.variants.find(v => v.size === s && (c ? v.colour === c : true)) || P.variants.find(v => v.size === s);
  let paintSizes = () => {
    $$('#sizes .size').forEach(b => {
      const v = variantFor(b.dataset.size, colour);
      const av = v ? v.availability : 'out';
      b.classList.toggle('is-out', av === 'out'); b.classList.toggle('is-few', av === 'few'); b.disabled = av === 'out';
      b.classList.toggle('active', size === b.dataset.size);
    });
    const v = size ? variantFor(size, colour) : null;
    if (v) $('#price').textContent = money(v.price);
    $('#sizeHint').textContent = v ? (v.availability === 'few' ? 'Only a few left in this size.' : v.availability === 'out' ? 'Sold out in this size.' : 'In stock as of the last update from the shop.') : 'Choose a size.';
    $('#addBtn').disabled = !v || v.availability === 'out';
    const cn = $('#colourName'); if (cn) cn.textContent = colour && colour.toLowerCase() !== 'standard' ? '· ' + colour : '';
  };
  $$('#sizes .size').forEach(b => b.onclick = () => { if (b.disabled) return; size = b.dataset.size; paintSizes(); });
  $$('#colours .swatch').forEach(b => b.onclick = () => { $$('#colours .swatch').forEach(x => x.classList.remove('active')); b.classList.add('active'); colour = b.dataset.colour; if (b.dataset.photo) $('#mainImg').src = '/' + b.dataset.photo; paintSizes(); });
  $$('.thumb').forEach(b => b.onclick = () => { $$('.thumb').forEach(x => x.classList.remove('active')); b.classList.add('active'); $('#mainImg').src = b.dataset.img; });
  // one size only → pre-select it
  const inStock = $$('#sizes .size').filter(b => { const v = variantFor(b.dataset.size, colour); return v && v.availability !== 'out'; });
  if (inStock.length === 1) size = inStock[0].dataset.size;
  paintSizes();
  $('#addBtn').onclick = () => {
    const v = size ? variantFor(size, colour) : null;
    if (!v) { $('#sizeHint').textContent = 'Choose a size first.'; $('#sizes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const qty = Math.max(1, Math.min(10, Number($('#qty').value) || 1));
    cart.add({ variant_id: Number(v.id), code: P.code, slug: P.slug, name: P.name, size: v.size, colour: v.colour, price: Number(v.price), qty, cover: P.cover });
    pixel('AddToCart', { content_ids: [P.code], content_type: 'product', value: v.price * qty, currency: 'PKR' });
    track('add_to_cart', { l: P.code, v: v.price * qty });
    openCart(true);
  };
  // ── P68c — the buy bar ────────────────────────────────────────────────────
  // The real Add to cart button scrolls away on a phone exactly when the reading
  // that decides the sale begins. This shows a slim copy once it has gone, and
  // only then: on a laptop the observer never fires because the button stays put.
  const bar = $('#buyBar'), addBtn = $('#addBtn');
  if (bar && addBtn && 'IntersectionObserver' in window) {
    const showBar = on => { bar.hidden = !on; document.body.classList.toggle('has-buybar', on); };
    // only once you have gone PAST the button, never before you have reached it:
    // a buy bar sitting over the price on a page you have not scrolled yet is a
    // shop shouting at a customer still walking through the door.
    // The entry's rect is the one recorded at the crossing, which sits exactly ON
    // the margin and rounds either way — so ask the button where it is NOW.
    const decide = () => showBar(addBtn.getBoundingClientRect().bottom < 0);
    new IntersectionObserver(decide, { rootMargin: '-72px 0px 0px 0px' }).observe(addBtn);
    addEventListener('scroll', decide, { passive: true });
    $('#bbAdd').onclick = () => addBtn.click();
  }
  const paintBar = () => {
    if (!bar) return;
    const v = size ? variantFor(size, colour) : null;
    $('#bbPrice').textContent = v ? money(v.price) : $('#price').textContent;
    $('#bbSize').textContent = v ? `Size ${v.size}${v.colour && v.colour.toLowerCase() !== 'standard' ? ' · ' + v.colour : ''}` : 'Choose a size';
    $('#bbAdd').disabled = !!(v && v.availability === 'out');
  };
  const afterPaint = paintSizes;
  paintSizes = () => { afterPaint(); paintBar(); };
  paintSizes();

  // ── P68c — the photograph, full screen ────────────────────────────────────
  // Hand-written, like everything else here: a library for a lightbox is a
  // blank screen on the morning the shop's internet is slow.
  const lb = $('#lightbox'), photos = (P.photos || [P.cover]).filter(Boolean);
  if (lb && photos.length) {
    let at = 0;
    const show = i => {
      at = (i + photos.length) % photos.length;
      $('#lbImg').src = '/' + photos[at];
      $('#lbPrev').hidden = $('#lbNext').hidden = photos.length < 2;
    };
    const open = on => {
      lb.hidden = !on;
      document.body.style.overflow = on ? 'hidden' : '';
      if (on) { const cur = ($('#mainImg').getAttribute('src') || '').replace(/^\//, ''); show(Math.max(0, photos.indexOf(cur))); }
    };
    $('#zoomOpen') && ($('#zoomOpen').onclick = () => open(true));
    $('#lbClose').onclick = () => open(false);
    $('#lbPrev').onclick = () => show(at - 1);
    $('#lbNext').onclick = () => show(at + 1);
    lb.addEventListener('click', e => { if (e.target === lb || e.target.id === 'lbImg') open(false); });
    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') open(false);
      if (e.key === 'ArrowLeft') show(at - 1);
      if (e.key === 'ArrowRight') show(at + 1);
    });
    let x0 = null;
    lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) show(at + (dx < 0 ? 1 : -1));
      x0 = null;
    }, { passive: true });
  }

  pixel('ViewContent', { content_ids: [P.code], content_type: 'product', value: (P.variants[0] || {}).price, currency: 'PKR' });
  track('product', { l: P.code });
  const sh = $('#shareBtn');
  if (sh) sh.onclick = async () => {
    const data = { title: sh.dataset.title, text: sh.dataset.title + ' — ' + S.name, url: sh.dataset.url };
    if (navigator.share) { try { await navigator.share(data); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(sh.dataset.url); toast('Link copied'); } catch { prompt('Copy this link', sh.dataset.url); } }
  };
}

// ── grid filters ─────────────────────────────────────────────────────────────
$$('.filters').forEach(bar => {
  const grid = document.getElementById(bar.dataset.grid);
  if (!grid) return;
  const items = JSON.parse(grid.dataset.items || '[]');
  const cards = new Map($$('.card', grid).map(c => [c.dataset.code, c]));
  // a link from the shop can pre-filter: /c/boys/?size=24 (the "Send new arrivals" message)
  const want = new URLSearchParams(location.search).get('size');
  const sizeSel = bar.querySelector('[data-f=size]');
  if (want && sizeSel && [...sizeSel.options].some(o => o.value === want)) sizeSel.value = want;
  // P136 — the chip rows above the grid (age in months, kind, size) filter it too
  const chipRows = $(`.for-chips[data-grid="${bar.dataset.grid}"]`);
  const chipVal = f => { const row = chipRows.find(r => r.dataset.f === f); const on = row && row.querySelector('.chip.on'); return on ? on.dataset.v : ''; };
  const apply = () => {
    const size = (bar.querySelector('[data-f=size]') || {}).value || chipVal('size') || '', colour = (bar.querySelector('[data-f=colour]') || {}).value || '', sort = (bar.querySelector('[data-f=sort]') || {}).value || 'new', instock = !!(bar.querySelector('[data-f=instock]') || {}).checked;
    const age = (bar.querySelector('[data-f=age]') || {}).value || '', type = (bar.querySelector('[data-f=type]') || {}).value || '', season = (bar.querySelector('[data-f=season]') || {}).value || '';   // P56a
    const agem = Number(chipVal('agem')) || 0, kind = chipVal('kind');
    let shown = items.filter(i => (!size || i.sizes.includes(size) || (i.fs || []).includes(size)) && (!colour || i.colours.includes(colour)) && (!instock || i.av !== 'out')
      && (!age || i.age === age) && (!type || i.type === type) && (!season || i.season === season || i.season === 'ALL')
      && (!agem || (i.am || []).some(([lo, hi]) => agem >= lo && agem <= hi)) && (!kind || i.kind === kind));
    shown.sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : String(b.at).localeCompare(String(a.at)));
    const keep = new Set(shown.map(i => i.code));
    cards.forEach((el, code) => { el.hidden = !keep.has(code); });
    shown.forEach(i => grid.appendChild(cards.get(i.code)));
    const c = bar.querySelector('[data-count]'); if (c) c.textContent = shown.length + ' product' + (shown.length === 1 ? '' : 's');
  };
  bar.addEventListener('change', apply);
  // P136 — a chip picks one value in its row; ?age=5%20Years opens on that chip
  chipRows.forEach(row => {
    $('.chip', row).forEach(ch => ch.onclick = () => { $('.chip', row).forEach(x => x.classList.toggle('on', x === ch)); apply(); ch.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  });
  const wantAge = new URLSearchParams(location.search).get('age');
  if (wantAge) { const row = chipRows.find(r => r.dataset.f === 'agem'); const hit = row && $('.chip', row).find(c => c.textContent.trim().toLowerCase() === wantAge.trim().toLowerCase()); if (hit) hit.click(); }
  apply();
});

// ── P136 — the phone remembers who you are buying for ───────────────────────
// A group page opened is remembered; the homepage highlights that tile and shows New arrivals from that
// group first. Nothing is hidden — the rest simply come after.
if (window.PAGE && window.PAGE.forGroup) store.set('bgc_for', window.PAGE.forGroup);
if (document.body.classList.contains('p-home')) {
  const mine = store.get('bgc_for', '');
  if (mine) {
    const tile = $(`.who-tile[data-for="${mine}"]`); if (tile) tile.classList.add('is-mine');
    $('.grid-row').forEach(g => { const first = $('.card', g).filter(c => (c.dataset.for || '').split(' ').includes(mine)); first.reverse().forEach(c => g.prepend(c)); });
  }
}

// ── search page ──────────────────────────────────────────────────────────────
if (document.body.classList.contains('p-search') && window.PAGE && window.PAGE.q) {
  const out = $('#searchOut');
  fetch('/data/catalogue.json').then(r => r.json()).then(cat => {
    const q = window.PAGE.q;
    const hits = (cat.products || []).filter(p => matchProduct(p, q));
    pixel('Search', { search_string: q });
    track('search', { l: q, v: hits.length });   // what people look for, and how often we have none of it
    if (!hits.length) { out.innerHTML = `<div class="empty">Nothing matches “${esc(q)}”. Try fewer words, or <a href="/all/" style="color:var(--accent)">browse everything</a>.</div>`; return; }
    out.innerHTML = `<p class="muted">${hits.length} result${hits.length === 1 ? '' : 's'} for “${esc(q)}”</p><div class="grid">${hits.map(p => {
      const av = p.variants.some(v => v.availability === 'in') ? 'in' : p.variants.some(v => v.availability === 'few') ? 'few' : 'out';
      const price = p.price_min === p.price_max ? money(p.price_min) : `${money(p.price_min)} – ${money(p.price_max)}`;
      return `<a class="card${av === 'out' ? ' is-out' : ''}" href="/p/${esc(p.slug)}/"><div class="card-img">${p.cover ? `<img src="/${esc(p.cover)}" alt="${esc(p.name)}" loading="lazy">` : '<div class="noimg"></div>'}${p.is_new ? '<span class="badge">New</span>' : ''}${av === 'out' ? '<span class="badge badge-out">Sold out</span>' : ''}</div><div class="card-body"><div class="card-name">${esc(p.name)}</div><div class="card-meta">${esc(p.category_parent ? p.category_parent + ' · ' : '')}${esc(p.category)}</div><div class="card-price">${price}</div></div></a>`;
    }).join('')}</div>`;
  }).catch(() => { out.innerHTML = '<div class="empty">Search is not available right now.</div>'; });
}

// ── checkout ─────────────────────────────────────────────────────────────────
const form = $('#coForm');
if (form) {
  track('checkout', { v: cart.subtotal() });
  const lines = $('#coLines');
  const paint = () => {
    const mode = (form.querySelector('[name=delivery]:checked') || {}).value || 'DELIVERY';
    $('#addrBlock').style.display = mode === 'DELIVERY' ? '' : 'none';
    lines.innerHTML = cart.lines.length ? cart.lines.map(l => `<div class="line"><div style="grid-column:1/3"><div class="line-name">${esc(l.name)}</div><div class="line-meta">${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''} × ${l.qty}</div></div><div class="line-price">${money(l.price * l.qty)}</div></div>`).join('') : '<div class="cart-empty">Your cart is empty. <a href="/new/" style="color:var(--accent)">Add something first →</a></div>';
    const sub = cart.subtotal(), del = deliveryCharge(sub, mode);
    $('#coSub').textContent = money(sub);
    $('#coDelLabel').textContent = mode === 'COLLECT' ? 'Collect from the shop' : 'Delivery';
    $('#coDel').textContent = mode === 'COLLECT' ? 'Rs 0' : del ? money(del) : (Number(S.delivery_charge || 0) <= 0 && !(Number(S.free_delivery_above || 0) > 0) ? 'told on the call' : 'Free');
    $('#coTotal').textContent = money(sub + del);
    $('#coDelNote').textContent = mode === 'COLLECT' ? 'We keep the pieces aside once confirmed — bring the order number.' : deliveryNote(sub);
    $('#coSubmit').disabled = !cart.lines.length;
  };
  form.querySelectorAll('[name=delivery]').forEach(r => r.onchange = paint);
  form.addEventListener('input', ev => { const el = ev.target; if (el.classList && el.classList.contains('is-bad')) { el.classList.remove('is-bad'); const fe = (el.closest('label') || el.parentElement).querySelector('.fe'); if (fe) fe.remove(); } });
  const savedRef = refCode(); if (savedRef && !form.ref.value) form.ref.value = savedRef;
  const last = store.get('bgc_customer'); if (last) for (const k of ['name', 'phone', 'alt_phone', 'address', 'city', 'province']) if (last[k] && form[k] && !form[k].value) form[k].value = last[k];
  paint();
  let turnstileToken = ''; window.onTurnstile = t => { turnstileToken = t; };
  const showErrors = fields => {
    $$('.fe', form).forEach(e => e.remove()); $$('.is-bad', form).forEach(e => e.classList.remove('is-bad'));
    for (const [k, msg] of Object.entries(fields || {})) { const el = form[k]; if (!el || !el.classList) continue; el.classList.add('is-bad'); const fe = document.createElement('div'); fe.className = 'fe'; fe.textContent = msg; el.closest('label') ? el.closest('label').appendChild(fe) : el.after(fe); }
    const first = $('.is-bad', form); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  form.onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#coErr'); err.hidden = true;
    if (!cart.lines.length) return;
    const f = Object.fromEntries(new FormData(form).entries());
    const local = {};
    if (String(f.name || '').trim().length < 2) local.name = 'Your name, please.';
    if (!/^0?3\d{9}$/.test(String(f.phone || '').replace(/\D/g, '').replace(/^(00)?92/, '0'))) local.phone = 'A Pakistani mobile number, like 0300 1234567.';
    if (f.delivery !== 'COLLECT') { if (String(f.address || '').trim().length < 10) local.address = 'The full address — house, street, area, a landmark.'; if (String(f.city || '').trim().length < 2) local.city = 'Which city?'; }
    if (f.ref && !/^\d{3,4}$/.test(f.ref.trim())) local.ref = 'A referral code is 3 or 4 digits.';
    if (Object.keys(local).length) { showErrors(local); return; }
    const btn = $('#coSubmit'); btn.disabled = true; btn.textContent = 'Placing your order…';
    try {
      if (window.turnstile && !turnstileToken) { try { await new Promise((res, rej) => { window.onTurnstile = t => { turnstileToken = t; res(); }; turnstile.execute(); setTimeout(rej, 15000); }); } catch { /* server decides */ } }
      const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, lines: cart.lines.map(l => ({ variant_id: l.variant_id, qty: l.qty })), utm: utmData(), turnstile: turnstileToken }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.error === 'VALIDATION') showErrors(j.fields);
        else if (j.error === 'SOLD_OUT') { err.textContent = 'Sold out since you added it: ' + (j.items || []).map(i => `${i.name || ''} ${i.size || ''}`.trim()).filter(Boolean).join(', ') + '. Remove those pieces and try again.'; err.hidden = false; (j.items || []).forEach(i => cart.setQty(Number(i.variant_id), 0)); paint(); }
        else { err.textContent = j.message || 'The order could not be placed. Please try again or order on WhatsApp.'; err.hidden = false; }
        btn.disabled = false; btn.textContent = 'Place order'; turnstileToken = ''; if (window.turnstile) try { turnstile.reset(); } catch { /* */ }
        return;
      }
      store.set('bgc_customer', { name: f.name, phone: f.phone, alt_phone: f.alt_phone, address: f.address, city: f.city, province: f.province });
      store.set('bgc_last_order', { no: j.no, phone: f.phone, total: j.total, lines: j.lines, delivery_charge: j.delivery_charge });
      pixel('Purchase', { value: j.total, currency: 'PKR', content_ids: cart.lines.map(l => l.code), content_type: 'product', num_items: cart.count() });
      track('order', { l: j.no, v: j.total, now: true });
      cart.clear();
      location.href = '/thanks/' + j.no + '/';
    } catch {
      err.textContent = 'No connection — please check your internet and try again.'; err.hidden = false; btn.disabled = false; btn.textContent = 'Place order';
    }
  };
}

// ── thanks ───────────────────────────────────────────────────────────────────
if (document.body.classList.contains('p-thanks')) {
  const last = store.get('bgc_last_order'), no = window.PAGE && window.PAGE.no;
  if (last && last.no === no && $('#thanksLines')) {
    $('#thanksLines').innerHTML = `<div class="order-box">${(last.lines || []).map(l => `<div class="row"><span>${esc(l.name)} · ${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''} × ${l.qty}</span><strong>${money(l.price * l.qty)}</strong></div>`).join('')}
      <div class="row"><span>Delivery</span><strong>${last.delivery_charge ? money(last.delivery_charge) : 'Free / told on the call'}</strong></div><div class="row total"><span>Total to pay on delivery</span><strong>${money(last.total)}</strong></div></div>`;
  }
}

// ── track ────────────────────────────────────────────────────────────────────
const tf = $('#trackForm');
if (tf) {
  const out = $('#trackOut');
  const last = store.get('bgc_last_order'); if (last && !tf.no.value) { tf.no.value = last.no; tf.phone.value = last.phone || ''; }
  // P51 — the shop types each courier step by hand, so the customer can see
  // exactly where her parcel is instead of "with the courier" for four days.
  const ORDER = ['NEW', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'AT_STATION', 'OUT_FOR_DELIVERY', 'DELIVERED'], COLLECT = ['NEW', 'CONFIRMED', 'READY', 'COLLECTED'];
  const LABEL = { NEW: 'Order received', CONFIRMED: 'Confirmed by phone', PACKED: 'Packed', DISPATCHED: 'With the courier',
    AT_STATION: 'At your city\'s station', OUT_FOR_DELIVERY: 'Out for delivery today', ON_HOLD: 'On hold with the courier',
    RETURN_STARTED: 'Could not be delivered', RETURN_BOOKED: 'Coming back to the shop', RETURN_SHIPPED: 'On its way back to the shop',
    RETURN_RECEIVED: 'Back at the shop', DELIVERED: 'Delivered', READY: 'Ready to collect', COLLECTED: 'Collected',
    RTO: 'Returned to the shop', CANCELLED: 'Cancelled' };
  const COMING_BACK = ['RETURN_STARTED', 'RETURN_BOOKED', 'RETURN_SHIPPED', 'RETURN_RECEIVED'];
  tf.onsubmit = async ev => {
    ev.preventDefault(); out.innerHTML = '<p class="muted">Looking it up…</p>';
    const q = new URLSearchParams({ no: tf.no.value.trim(), phone: tf.phone.value.trim() });
    const res = await fetch('/api/track?' + q); const j = await res.json().catch(() => ({}));
    if (!res.ok) { out.innerHTML = `<div class="empty">${esc(j.message || 'Not found.')}</div>`; return; }
    const steps = j.delivery === 'COLLECT' ? COLLECT : ORDER;
    // a parcel that is on hold or coming back is not "somewhere along the road":
    // it is its own state, said plainly, with the shop's number to ring
    const aside = j.status === 'ON_HOLD' || COMING_BACK.includes(j.status);
    const idx = aside ? steps.indexOf('DISPATCHED') : steps.indexOf(j.status);
    const terminal = ['RTO', 'CANCELLED'].includes(j.status);
    out.innerHTML = `<h2 style="margin:22px 0 6px">${esc(j.no)}</h2><p class="muted">${esc(j.status_text)}${j.status_updated_at ? ' · ' + new Date(j.status_updated_at).toLocaleString('en-PK') : ''}</p>
      ${j.tracking_no ? `<p><strong>Courier:</strong> ${esc(j.courier || 'Leopards')} · tracking number <strong>${esc(j.tracking_no)}</strong> ${j.tracking_url ? `— <a href="${esc(j.tracking_url)}" target="_blank" rel="noopener" style="color:var(--accent)">track on the courier's site ↗</a>` : ''}</p>` : ''}
      ${aside ? `<div class="soldout" style="margin:10px 0;">${esc(LABEL[j.status])} — please call us on ${esc(S.whatsapp || '')} and we will sort it out.</div>` : ''}
      ${terminal ? `<div class="soldout">${esc(LABEL[j.status])}</div>` : `<div class="timeline">${steps.map((s, i) => `<div class="tl ${i < idx ? 'done' : i === idx ? 'now' : ''}"><i>${i < idx ? '✓' : ''}</i><span>${esc(LABEL[s])}</span></div>`).join('')}</div>`}
      <div class="order-box">${j.lines.map(l => `<div class="row"><span>${esc(l.name)} · ${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''} × ${l.qty}</span><strong>${money(l.price * l.qty)}</strong></div>`).join('')}<div class="row total"><span>Total</span><strong>${money(j.total)}</strong></div></div>`;
  };
  if (tf.no.value && tf.phone.value && new URLSearchParams(location.search).get('no')) tf.requestSubmit();
}


// ── P68a — a colour swatch swaps the card's picture ─────────────────────────
// Delegated on the document, so it keeps working after the filters re-sort the
// grid and after a search paints new cards.
document.addEventListener('click', e => {
  const sw = e.target.closest && e.target.closest('.sw-img');
  if (!sw) return;
  e.preventDefault();
  const card = sw.closest('.card');
  const img = card && card.querySelector('.card-photo');
  if (!img) return;
  img.src = sw.dataset.photo;
  card.querySelectorAll('.sw-img').forEach(x => x.classList.toggle('on', x === sw));
});

// P68a — the phone's Filter button
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-ftoggle]');
  if (!b) return;
  const box = b.parentElement.querySelector('.f-controls');
  if (!box) return;
  const open = box.classList.toggle('open');
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
});

// ── P68b — the header gets out of the way ───────────────────────────────────
// Going down the page it slides away, so a phone screen is all shop. Coming back
// up it returns at once, because coming up is what you do when you want search
// or the cart. Never hidden at the very top, and never on a laptop.
(function header() {
  const hdr = document.querySelector('.hdr');
  if (!hdr || !window.matchMedia('(max-width: 820px)').matches) return;
  let last = window.scrollY, ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y > 140 && y > last + 6) document.body.classList.add('hdr-away');
      else if (y < last - 6 || y < 120) document.body.classList.remove('hdr-away');
      last = y; ticking = false;
    });
  }, { passive: true });
})();
