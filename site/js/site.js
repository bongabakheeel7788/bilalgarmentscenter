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
// P161 — one moment, three pixels. Facebook's event names are the source; TikTok and Google (Google Ads / YouTube and
// Analytics) are sent the same moment in their own words. `order_id` rides along on a purchase so no platform ever
// counts one order twice (Facebook eventID, TikTok event_id, Google transaction_id). No phone, name or address is sent.
const TT_EVENT = { ViewContent: 'ViewContent', AddToCart: 'AddToCart', InitiateCheckout: 'InitiateCheckout', Search: 'Search', Purchase: 'CompletePayment' };
const G_EVENT = { ViewContent: 'view_item', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Search: 'search', Purchase: 'purchase' };
const pixel = (ev, data = {}) => {
  const { order_id: orderId, ...fb } = data;
  const ids = (fb.content_ids || []).map(String), value = Number(fb.value) || 0;
  if (S.pixel && window.fbq) try { if (orderId) fbq('track', ev, fb, { eventID: 'order-' + orderId }); else fbq('track', ev, fb); } catch { /* ad blocker */ }
  if (S.tiktok && window.ttq && TT_EVENT[ev]) try {
    ttq.track(TT_EVENT[ev], ev === 'Search' ? { query: fb.search_string || '' }
      : { contents: ids.map(id => ({ content_id: id, content_type: 'product' })), content_type: 'product', value, currency: 'PKR' },
      orderId ? { event_id: 'order-' + orderId } : undefined);
  } catch { /* ad blocker */ }
  if (S.google && window.gtag && G_EVENT[ev]) try {
    gtag('event', G_EVENT[ev], ev === 'Search' ? { search_term: fb.search_string || '' }
      : { currency: 'PKR', value, items: ids.map(id => ({ item_id: id })), ...(orderId ? { transaction_id: String(orderId) } : {}) });
    if (ev === 'Purchase' && S.google_purchase) gtag('event', 'conversion', { send_to: S.google_purchase, value, currency: 'PKR', ...(orderId ? { transaction_id: String(orderId) } : {}) });
  } catch { /* ad blocker */ }
};
const track = (k, o) => { try { if (window.bgcTrack) window.bgcTrack(k, o); } catch (e) { /* the visit log never breaks a sale */ } };
const waHref = text => `https://wa.me/${S.whatsapp_intl || String(S.whatsapp || '').replace(/^0/, '92').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

// ── P154 — when it arrives ───────────────────────────────────────────────────
// Fahad, 2026-09-27: "it takes 3-5 days to deliver, Sunday is off … lets customers know expected delivery time".
// Counted in the shop's own days (Asia/Karachi, UTC+5, no daylight saving) from TOMORROW, a Sunday never counted:
// ordered Saturday 27 Sep → Wed 1 Oct – Fri 3 Oct. The page arrives saying "3–5 working days"; this adds the dates.
const ETA = { from: 3, to: 5 };
function etaDates(now = new Date()) {
  const k = new Date(now.getTime() + 5 * 3600e3);
  let d = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  const days = [];
  while (days.length < ETA.to) { d += 86400e3; if (new Date(d).getUTCDay() !== 0) days.push(new Date(d)); }
  return { first: days[ETA.from - 1], last: days[ETA.to - 1] };
}
// written out by hand, so every phone says "Wed 30 Sep" (browsers disagree on "Sep" / "Sept")
const etaDay = d => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
(function paintEta() {
  const els = $$('[data-eta]');
  if (!els.length) return;
  const { first, last } = etaDates();
  const html = `<strong>Expected delivery: ${esc(etaDay(first))} – ${esc(etaDay(last))}</strong><span>3–5 working days, Sundays not counted.</span>`;
  els.forEach(e => { e.innerHTML = html; });
})();
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
  // P154 — a Facebook link with no tags still says where she came from: Facebook adds fbclid to every click (an ad
  // or a post — so it names the SOURCE only, never "paid"; P100). Kept for 7 days, not just the tab: a mother who
  // taps the ad at lunch and orders from the same phone that evening is still that ad's order.
  if (!utm.source && q.get('fbclid')) utm.source = /Instagram/i.test(navigator.userAgent) ? 'instagram' : 'facebook';
  if (Object.keys(utm).length) { utm.landing = (location.pathname + location.search).slice(0, 300); store.set('bgc_utm', { ...utm, until: Date.now() + 7 * 86400e3 }); }
})();
const refCode = () => { const r = store.get('bgc_ref'); return r && r.until > Date.now() ? r.code : ''; };
const utmData = () => {
  const u = store.get('bgc_utm');
  if (u && u.until > Date.now()) { const { until, ...rest } = u; return rest; }
  try { return JSON.parse(sessionStorage.getItem('bgc_utm') || '{}'); } catch { return {}; }   // a tab opened before P154
};

// ── the cart ─────────────────────────────────────────────────────────────────
// P141 — a line is a piece (variant_id) or a pack (key: the deal, the size and the colour choice)
const keyOf = l => l.pack ? l.key : 'v' + l.variant_id;
const maxOf = l => l.pack ? Math.max(1, Math.min(3, l.max || 3)) : 10;
const cart = {
  lines: store.get('bgc_cart', []),
  // P154 — every change is announced, so the checkout's "Your order" follows a change made in the drawer
  save() { store.set('bgc_cart', this.lines); paintCart(); document.dispatchEvent(new Event('bgc:cart')); },
  // P154 — read again from the phone's storage: the page may be one the browser kept from before (Back), holding a
  // cart from before the last add; saving THAT over the stored one wiped whatever was added since.
  reload() { const l = store.get('bgc_cart', []); this.lines = Array.isArray(l) ? l.filter(x => x && typeof x === 'object' && Number(x.qty) > 0) : []; paintCart(); document.dispatchEvent(new Event('bgc:cart')); },
  add(l) { const hit = this.lines.find(x => keyOf(x) === keyOf(l)); if (hit) hit.qty = Math.min(maxOf(hit), hit.qty + l.qty); else this.lines.push(l); this.save(); },
  setQty(key, qty) { const hit = this.lines.find(x => keyOf(x) === key); if (!hit) return; hit.qty = Math.max(0, Math.min(maxOf(hit), qty)); if (!hit.qty) this.lines = this.lines.filter(x => x !== hit); this.save(); },
  clear() { this.lines = []; this.save(); },
  subtotal() { return this.lines.reduce((s, l) => s + l.price * l.qty, 0); },
  count() { return this.lines.reduce((s, l) => s + l.qty * (l.pack ? l.pieces : 1), 0); },
  hasPack() { return this.lines.some(l => l.pack); },
};
/** what a cart line says under its name */
const lineMeta = l => l.pack ? `Size ${esc(l.size)} · ${l.pieces} pieces · ${esc(l.choiceText)}`
  : `${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''}`;
function deliveryCharge(sub, mode) {
  if (mode === 'COLLECT') return 0;
  if (cart.hasPack()) return 0;                                // P141 — a pack comes with free delivery
  const free = Number(S.free_delivery_above || 0), ch = Number(S.delivery_charge || 0);
  if (ch <= 0) return 0;
  if (free > 0 && sub >= free) return 0;
  return ch;
}
function deliveryNote(sub) {
  if (cart.hasPack()) return 'Free delivery — a pack is in your cart.';   // P141
  const free = Number(S.free_delivery_above || 0), ch = Number(S.delivery_charge || 0);
  if (ch <= 0) return free > 0 ? '' : 'Delivery charge is confirmed on the call.';
  if (free > 0 && sub >= free) return 'You get free delivery.';
  if (free > 0) return 'Add ' + money(free - sub) + ' more for free delivery.';
  return 'Delivery ' + money(ch) + ' per parcel.';
}
/** P167 — the note, and under it a bar filling toward the free-delivery amount (green once reached) */
function paintDelivery(el, sub) {
  if (!el) return;
  const free = Number(S.free_delivery_above || 0), ch = Number(S.delivery_charge || 0);
  const note = esc(deliveryNote(sub));
  if (cart.hasPack() || ch <= 0 || free <= 0 || sub <= 0) { el.innerHTML = note; el.classList.remove('fd-done'); return; }
  const done = sub >= free, pct = Math.min(100, Math.round(sub / free * 100));
  el.classList.toggle('fd-done', done);
  el.innerHTML = `<span class="fd-note">${note}</span><span class="fd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${free}" aria-valuenow="${Math.min(sub, free)}" aria-label="Toward free delivery"><i style="width:${pct}%"></i></span>`;
}
function paintCart() {
  const n = cart.count(), c = $('#cartCount');
  if (c) { c.textContent = n; c.hidden = !n; }
  const box = $('#cartLines');
  if (!box) return;
  box.innerHTML = cart.lines.length ? cart.lines.map(l => `<div class="line">
    ${l.cover ? `<img src="/${esc(l.cover)}" alt="">` : '<div class="noimg" style="width:56px;height:70px;border-radius:8px"></div>'}
    <div><a class="line-name" href="/${l.pack ? 'd' : 'p'}/${esc(l.slug)}/">${esc(l.name)}</a><div class="line-meta">${lineMeta(l)} · ${money(l.price)}</div>
      <div class="line-qty"><button data-dec="${esc(keyOf(l))}" aria-label="Less">−</button><span>${l.qty}</span><button data-inc="${esc(keyOf(l))}" aria-label="More">+</button></div></div>
    <div><div class="line-price">${money(l.price * l.qty)}</div><button class="line-rm" data-rm="${esc(keyOf(l))}">Remove</button></div></div>`).join('')
    : '<div class="cart-empty">Your cart is empty.<br><a href="/new/" style="color:var(--accent);font-weight:700">See what is new →</a></div>';
  const sub = cart.subtotal();
  $('#cartSub').textContent = money(sub);
  paintDelivery($('#cartDelivery'), sub);   // P167
  $('#cartCheckout').style.display = cart.lines.length ? '' : 'none';
  const qtyOf = k => (cart.lines.find(x => keyOf(x) === k) || {}).qty || 0;
  $$('[data-dec]', box).forEach(b => b.onclick = () => cart.setQty(b.dataset.dec, qtyOf(b.dataset.dec) - 1));
  $$('[data-inc]', box).forEach(b => b.onclick = () => cart.setQty(b.dataset.inc, qtyOf(b.dataset.inc) + 1));
  $$('[data-rm]', box).forEach(b => b.onclick = () => cart.setQty(b.dataset.rm, 0));
}
function openCart(open) { const d = $('#cart'), b = $('#backdrop'); if (!d) return; d.hidden = !open; b.hidden = !open; document.body.style.overflow = open ? 'hidden' : ''; if (open) paintCart(); }
$('#cartBtn') && ($('#cartBtn').onclick = () => openCart(true));
$('#cartClose') && ($('#cartClose').onclick = () => openCart(false));
$('#backdrop') && ($('#backdrop').onclick = () => openCart(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openCart(false); });
// P154 — back to a page the browser kept in memory, or the cart changed in another tab: take the stored cart
addEventListener('pageshow', e => { if (e.persisted) cart.reload(); });
addEventListener('storage', e => { if (e.key === 'bgc_cart') cart.reload(); });
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
    // P154 — live before a size is chosen: its tap is what says "Choose a size first" and scrolls to the sizes. It
    // used to be disabled until then, and a disabled button's tap never runs — from the bar at the bottom of a phone
    // the button simply did nothing. Greyed only when there is nothing to sell.
    $('#addBtn').disabled = allOut || (!!v && v.availability === 'out');
    const cn = $('#colourName'); if (cn) cn.textContent = colour && colour.toLowerCase() !== 'standard' ? '· ' + colour : '';
  };
  const allOut = !P.variants.some(v => v.availability !== 'out');
  // P166 — the gallery is a row of slides you swipe; a colour's photo is found among them, else shown in the first
  const galTrack = $('#galTrack'), slides = galTrack ? $$('.gal-slide', galTrack) : [];
  const goSlide = (i, smooth = true) => { if (!galTrack || !slides[i]) return; galTrack.scrollTo({ left: slides[i].offsetLeft, behavior: smooth ? 'smooth' : 'auto' }); };
  const showPhoto = src => {
    const i = slides.findIndex(s => (s.querySelector('img').getAttribute('src') || '') === src);
    if (i >= 0) return goSlide(i);
    const mi = $('#mainImg'); if (mi) { mi.src = src; goSlide(0); }
  };
  const markColour = c => { const sw = $$('#colours .swatch').find(x => x.dataset.colour === c); $$('#colours .swatch').forEach(x => x.classList.remove('active')); if (!sw) return; sw.classList.add('active'); if (sw.dataset.photo) showPhoto('/' + sw.dataset.photo); };
  const hasPair = (s, c) => P.variants.some(v => v.size === s && v.colour === c);
  // P154 — a size the chosen colour does not come in used to put ANOTHER colour's piece in the cart while the swatch
  // still showed hers. Now the swatch moves to the colour that will actually be sent, where she can see it.
  $$('#sizes .size').forEach(b => b.onclick = () => {
    if (b.disabled) return; size = b.dataset.size;
    const v = variantFor(size, colour); if (v && colour && v.colour && v.colour !== colour && $('#colours')) { colour = v.colour; markColour(colour); }
    paintSizes();
  });
  $$('#colours .swatch').forEach(b => b.onclick = () => {
    $$('#colours .swatch').forEach(x => x.classList.remove('active')); b.classList.add('active'); colour = b.dataset.colour; if (b.dataset.photo) showPhoto('/' + b.dataset.photo);
    if (size && !hasPair(size, colour)) size = null;      // P154 — this colour has no such size: she chooses again, never a silent swap
    paintSizes();
  });
  // P156 — the size guide is the second photo: shown whole (contain, on white), not cropped like a garment (.is-guide
  // on its slide). P166 — a thumb goes to its slide; the counter, the dots and the thumbs follow the swipe.
  let at = 0;
  $$('.thumb').forEach(b => b.onclick = () => goSlide(Number(b.dataset.i) || 0));
  if (galTrack) {
    const dots = $$('#galDots i'), count = $('#galCount');
    const follow = () => {
      const i = Math.round(galTrack.scrollLeft / Math.max(1, galTrack.clientWidth));
      if (i === at || !slides[i]) return;
      at = i;
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      if (count) count.textContent = `${i + 1} / ${slides.length}`;
      $$('.thumb').forEach(x => x.classList.toggle('active', Number(x.dataset.i) === i));
    };
    galTrack.addEventListener('scroll', () => requestAnimationFrame(follow), { passive: true });
  }
  const sg = $('#sgOpen');
  const gi = slides.findIndex(s => s.classList.contains('is-guide'));
  if (sg && gi >= 0) sg.onclick = e => { e.preventDefault(); goSlide(gi, false); $('.gallery-main').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  // one size only → pre-select it
  const inStock = $$('#sizes .size').filter(b => { const v = variantFor(b.dataset.size, colour); return v && v.availability !== 'out'; });
  if (inStock.length === 1) {
    size = inStock[0].dataset.size;
    const v0 = variantFor(size, colour); if (v0 && colour && v0.colour && v0.colour !== colour && $('#colours')) { colour = v0.colour; markColour(colour); }   // P154 — as a tap does
  }
  paintSizes();
  $('#addBtn').onclick = () => {
    const v = size ? variantFor(size, colour) : null;
    if (!v) {
      const colourOut = colour && $('#colours') && !P.variants.some(x => x.colour === colour && x.availability !== 'out');
      $('#sizeHint').textContent = colourOut ? 'Sold out in this colour — choose another colour.' : 'Choose a size first.';
      $(colourOut ? '#colours' : '#sizes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return;
    }
    const qty = $('#qty') ? Math.max(1, Math.min(10, Number($('#qty').value) || 1)) : 1;   // P166 — the cart changes how many
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
  const phone = window.matchMedia('(max-width: 820px)');
  // P166 — on a phone the bar is the Add to cart button: there from the first moment, the page's own one hidden
  if (bar && addBtn && phone.matches) { bar.hidden = false; document.body.classList.add('has-buybar'); $('#bbAdd').onclick = () => addBtn.click(); }
  else if (bar && addBtn && 'IntersectionObserver' in window) {
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
    const bs = $('#bbSize');
    if (bs) { bs.textContent = v ? `Size ${v.size}${v.colour && v.colour.toLowerCase() !== 'standard' ? ' · ' + v.colour : ''}` : ''; bs.hidden = !v; }
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
    slides.forEach(s => s.addEventListener('click', () => { open(true); show(Number(s.dataset.i) || 0); }));
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
  // Fix 1.0.60 — these were `$` (one element) treated as lists: `chipRows.forEach` threw on every
  // listing page and the whole block below it died — chips, the phone's Filter button, the swatch
  // photo swap and "remember my group" were all dead on the live site for a day. `$$` is the list.
  const chipRows = $$(`.for-chips[data-grid="${bar.dataset.grid}"]`);
  const chipVal = f => { const row = chipRows.find(r => r.dataset.f === f); const on = row && row.querySelector('.chip.on'); return on ? on.dataset.v : ''; };
  const apply = () => {
    const size = (bar.querySelector('[data-f=size]') || {}).value || chipVal('size') || '', colour = (bar.querySelector('[data-f=colour]') || {}).value || '', sort = (bar.querySelector('[data-f=sort]') || {}).value || 'new', instock = !!(bar.querySelector('[data-f=instock]') || {}).checked;
    const age = (bar.querySelector('[data-f=age]') || {}).value || '', type = (bar.querySelector('[data-f=type]') || {}).value || '', season = (bar.querySelector('[data-f=season]') || {}).value || '';   // P56a
    // Fix 1.0.62 — the Age dropdown and the age chips mean the same thing: a piece shows when ANY of its
    // sizes fits that age (it used to compare the piece's youngest age by name, exact match only)
    const agem = Number(chipVal('agem')) || Number(age) || 0, kind = chipVal('kind');
    let shown = items.filter(i => (!size || i.sizes.includes(size) || (i.fs || []).includes(size)) && (!colour || i.colours.includes(colour)) && (!instock || i.av !== 'out')
      && (!type || i.type === type) && (!season || i.season === season || i.season === 'ALL')
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
    $$('.chip', row).forEach(ch => ch.onclick = () => { $$('.chip', row).forEach(x => x.classList.toggle('on', x === ch)); apply(); ch.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  });
  const wantAge = new URLSearchParams(location.search).get('age');
  if (wantAge) { const row = chipRows.find(r => r.dataset.f === 'agem'); const hit = row && $$('.chip', row).find(c => c.textContent.trim().toLowerCase() === wantAge.trim().toLowerCase()); if (hit) hit.click(); }
  // P139 — a homepage tile opens its group page on that kind: /for/boys/?kind=Casual%20Shirts
  const wantKind = new URLSearchParams(location.search).get('kind');
  if (wantKind) { const row = chipRows.find(r => r.dataset.f === 'kind'); const hit = row && $$('.chip', row).find(c => c.dataset.v === wantKind); if (hit) hit.click(); }
  apply();
});

// ── P136 — the phone remembers who you are buying for ───────────────────────
// A group page opened is remembered; the homepage highlights that tile and shows New arrivals from that
// group first. Nothing is hidden — the rest simply come after.
if (window.PAGE && window.PAGE.forGroup) store.set('bgc_for', window.PAGE.forGroup);
if (document.body.classList.contains('p-home')) {
  const mine = store.get('bgc_for', '');
  if (mine) {
    // P139 — the group the phone last shopped for comes first among the homepage tiles, marked with a dot
    const sec = $(`.kg[data-for="${mine}"]`); if (sec) { sec.classList.add('is-mine'); sec.parentNode.prepend(sec); }
    $$('.grid-row').forEach(g => { const first = $$('.card', g).filter(c => (c.dataset.for || '').split(' ').includes(mine)); first.reverse().forEach(c => g.prepend(c)); });
  }
}

// ── search page ──────────────────────────────────────────────────────────────
if (document.body.classList.contains('p-search') && window.PAGE && window.PAGE.q) {
  const out = $('#searchOut');
  fetch('/data/catalogue.json').then(r => r.json()).then(cat => {
    const q = window.PAGE.q;
    // P143 — a deal listed as a product is found like one ("tights", "pack") and opens its pack page
    const packs = (cat.deal_cards || []).map(p => ({ ...p, name: p.name + ' pack' }));
    const hits = [...(cat.products || []), ...packs].filter(p => matchProduct(p, q));
    pixel('Search', { search_string: q });
    track('search', { l: q, v: hits.length });   // what people look for, and how often we have none of it
    if (!hits.length) { out.innerHTML = `<div class="empty">Nothing matches “${esc(q)}”. Try fewer words, or <a href="/all/" style="color:var(--accent)">browse everything</a>.</div>`; return; }
    out.innerHTML = `<p class="muted">${hits.length} result${hits.length === 1 ? '' : 's'} for “${esc(q)}”</p><div class="grid">${hits.map(p => {
      const av = p.variants.some(v => v.availability === 'in') ? 'in' : p.variants.some(v => v.availability === 'few') ? 'few' : 'out';
      const price = p.price_min === p.price_max ? money(p.price_min) : p.deal ? `from ${money(p.price_min)}` : `${money(p.price_min)} – ${money(p.price_max)}`;   // P143: a pack is "from"
      return `<a class="card${av === 'out' ? ' is-out' : ''}" href="${esc(p.href || `/p/${p.slug}/`)}"><div class="card-img">${p.cover ? `<img src="/${esc(p.cover)}" alt="${esc(p.name)}" loading="lazy">` : '<div class="noimg"></div>'}${p.badge ? `<span class="badge badge-pack">${esc(p.badge)}</span>` : p.is_new ? '<span class="badge">New</span>' : ''}${av === 'out' ? '<span class="badge badge-out">Sold out</span>' : ''}</div><div class="card-body"><div class="card-name">${esc(p.name)}</div><div class="card-meta">${esc(p.category_parent ? p.category_parent + ' · ' : '')}${esc(p.category)}</div><div class="card-price">${price}</div></div></a>`;
    }).join('')}</div>`;
  }).catch(() => { out.innerHTML = '<div class="empty">Search is not available right now.</div>'; });
}

// ── P141 — a deal's pack page ────────────────────────────────────────────────
// One size, six pieces: mixed colours, a theme, or the customer's own (same price). The shop publishes, per
// size, how many packs can be made (0–3) and per colour up to how many can be picked — never a count.
function packRows(packs) {
  return (packs || []).map(p => `<div class="row"><span>${esc(p.name)} · size ${esc(p.size)} · ${esc(p.choice)} × ${p.qty}</span><strong>${money(p.price * p.qty)}</strong></div>`).join('');
}
const D = window.PAGE && window.PAGE.deal;
if (D && $('#dpSizes')) {
  const firstPrice = $('#price').textContent;
  let size = null, mode = 'MIXED', theme = null, own = {};
  // P143 — the photo on top follows what she picks: a theme shows its photo (like a colour on a product), a colour
  // she adds to her own pack shows that colour's photo, Mixed shows the cover. Thumbs and a swipe move through the
  // pack's own photos.
  const main = $('#dpMain'), photos = (D.photos || []).map(x => '/' + x);
  let at = 0;
  const show = src => { if (main && src) main.src = src; $$('#dpThumbs .thumb').forEach(t => t.classList.toggle('active', t.dataset.img === src)); };
  const colourPhoto = name => { const z = D.sizes.find(x => x.size === size) || D.sizes[0]; const c = z && z.colours.find(x => x.name === name); return c && c.photo ? '/' + c.photo : null; };
  $$('#dpThumbs .thumb').forEach((t, i) => t.onclick = () => { at = i; show(t.dataset.img); });
  const box = $('#dpMainBox');
  if (box && photos.length > 1) {
    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 40) return;
      at = (at + (dx < 0 ? 1 : photos.length - 1)) % photos.length; show(photos[at]);
    }, { passive: true });
  }
  const sizeOf = () => D.sizes.find(z => z.size === size);
  const picked = () => Object.values(own).reduce((a, b) => a + b, 0);
  const themeOk = (t, z) => !!t && t.colours.every(c => ((z.colours.find(x => x.name === c) || {}).max || 0) >= D.pieces / t.colours.length);
  const choiceText = () => mode === 'THEME' ? theme : mode === 'OWN' ? Object.entries(own).filter(([, n]) => n).map(([c, n]) => `${c} ×${n}`).join(', ') : 'mixed colours';
  const isReady = () => { const z = sizeOf(); return !!z && z.packs > 0 && (mode === 'MIXED' || (mode === 'THEME' && !!theme) || (mode === 'OWN' && picked() === D.pieces)); };
  const paint = () => {
    const z = sizeOf();
    $$('#dpSizes .size').forEach(b => b.classList.toggle('active', b.dataset.size === size));
    $('#price').textContent = z ? money(z.price) : firstPrice;
    $('#dpAge').textContent = z && z.age ? '· fits ' + z.age : '';
    $('#dpModeBox').hidden = !z;
    $$('#dpModes .dp-mode').forEach(b => {
      if (b.dataset.mode === 'THEME' && z) { const ok = themeOk(D.themes.find(x => x.name === b.dataset.theme), z); b.disabled = !ok; b.classList.toggle('is-out', !ok); }
      const on = b.dataset.mode === mode && (mode !== 'THEME' || b.dataset.theme === theme);
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('#dpOwn').hidden = mode !== 'OWN' || !z;
    if (mode === 'OWN' && z) {
      const full = picked() >= D.pieces;
      $('#dpGrid').innerHTML = z.colours.map(c => {
        const n = own[c.name] || 0;
        return `<div class="dp-col${n ? ' on' : ''}"><span class="dp-dot" style="background:${esc(c.hex || '#ddd')}"></span><span class="dp-name">${esc(c.name)}</span>
          <span class="dp-step"><button type="button" data-less="${esc(c.name)}" aria-label="One less ${esc(c.name)}"${n ? '' : ' disabled'}>−</button><b>${n}</b><button type="button" data-more="${esc(c.name)}" aria-label="One more ${esc(c.name)}"${n >= c.max || full ? ' disabled' : ''}>+</button></span></div>`;
      }).join('') || '<p class="muted">No colours to choose from in this size — pick Mixed.</p>';
      $('#dpCount').innerHTML = `<strong>${picked()} of ${D.pieces} chosen</strong> · same price as mixed`;
      $$('[data-more]', $('#dpGrid')).forEach(b => b.onclick = () => { own[b.dataset.more] = (own[b.dataset.more] || 0) + 1; paint(); show(colourPhoto(b.dataset.more)); });
      $$('[data-less]', $('#dpGrid')).forEach(b => b.onclick = () => { own[b.dataset.less] = Math.max(0, (own[b.dataset.less] || 0) - 1); paint(); });
    }
    // P154 — live while something is still to choose: the tap takes her there (below). A disabled button's tap never
    // runs, and on a phone it was the only button on the screen.
    $('#dpAdd').disabled = !D.sizes.some(x => x.packs > 0) || (!!z && z.packs <= 0);
    $('#dpAdd').classList.toggle('is-wait', !isReady());
    // P143 — the price rides on the button, which stays at the bottom of a phone's screen
    $('#dpAdd').textContent = !z ? 'Choose a size' : mode === 'OWN' && picked() < D.pieces ? `Choose ${D.pieces - picked()} more` : `Add pack · ${money(z.price)}`;
    const t = mode === 'THEME' ? D.themes.find(x => x.name === theme) : null, note = $('#dpThemeNote');
    if (note) { note.hidden = !t; if (t) note.innerHTML = `<strong>${esc(t.name)}</strong> — ${esc(t.colours.join(', '))}`; }
    $('#dpHint').textContent = !z ? `Choose a size. A crossed-out size has fewer than ${D.pieces} pieces left.`
      : mode === 'OWN' && picked() < D.pieces ? `Choose ${D.pieces - picked()} more.` : `${D.pieces} pieces of size ${z.size}${z.age ? ', fits ' + z.age : ''}.`;
  };
  $$('#dpSizes .size').forEach(b => b.onclick = () => { if (b.disabled) return; size = b.dataset.size; own = {}; if (mode === 'THEME' && !themeOk(D.themes.find(x => x.name === theme), sizeOf())) { mode = 'MIXED'; theme = null; } paint(); });
  $$('#dpModes .dp-mode').forEach(b => b.onclick = () => {
    if (b.disabled) return; mode = b.dataset.mode; theme = b.dataset.theme || null; paint();
    const t = theme && D.themes.find(x => x.name === theme);
    if (t && t.photo) show('/' + t.photo); else if (mode === 'MIXED' && photos[0]) { at = 0; show(photos[0]); }
  });
  const open = D.sizes.filter(z => z.packs > 0);
  if (open.length === 1) size = open[0].size;
  paint();
  // P154 — the ad lands here: it counts as a product viewed, for the pixel and for the shop's own visit log
  pixel('ViewContent', { content_ids: ['pack:' + D.slug], content_type: 'product', value: Math.min(...D.sizes.map(z => Number(z.price))), currency: 'PKR' });
  track('product', { l: 'pack:' + D.slug });
  $('#dpAdd').onclick = () => {
    const z = sizeOf();
    if (!z) { $('#dpHint').textContent = 'Choose a size first.'; $('#dpSizes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (mode === 'OWN' && picked() < D.pieces) { $('#dpOwn').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!isReady() || $('#dpAdd').disabled) return;
    const colours = mode === 'OWN' ? Object.fromEntries(Object.entries(own).filter(([, n]) => n)) : undefined;
    const key = ['d', D.slug, z.size, mode, theme || '', colours ? Object.keys(colours).sort().map(c => c + colours[c]).join('.') : ''].join(':');
    cart.add({ pack: true, key, slug: D.slug, name: D.name, size: z.size, pieces: D.pieces, mode, theme: theme || undefined, colours, choiceText: choiceText(), price: Number(z.price), qty: 1, max: z.packs, cover: D.cover });
    pixel('AddToCart', { content_ids: ['pack:' + D.slug], content_type: 'product', value: z.price, currency: 'PKR' });
    track('add_to_cart', { l: 'pack:' + D.slug, v: z.price });
    openCart(true);
  };
}

// ── checkout ─────────────────────────────────────────────────────────────────
const form = $('#coForm');
if (form) {
  track('checkout', { v: cart.subtotal() });
  const lines = $('#coLines');
  const paint = () => {
    const mode = (form.querySelector('[name=delivery]:checked') || {}).value || 'DELIVERY';
    $('#addrBlock').style.display = mode === 'DELIVERY' ? '' : 'none';
    lines.innerHTML = cart.lines.length ? cart.lines.map(l => `<div class="line"><div style="grid-column:1/3"><div class="line-name">${esc(l.name)}</div><div class="line-meta">${lineMeta(l)} × ${l.qty}</div></div><div class="line-price">${money(l.price * l.qty)}</div></div>`).join('') : '<div class="cart-empty">Your cart is empty. <a href="/new/" style="color:var(--accent)">Add something first →</a></div>';
    const sub = cart.subtotal(), del = deliveryCharge(sub, mode);
    $('#coSub').textContent = money(sub);
    $('#coDelLabel').textContent = mode === 'COLLECT' ? 'Collect from the shop' : 'Delivery';
    $('#coDel').textContent = mode === 'COLLECT' ? 'Rs 0' : del ? money(del) : (Number(S.delivery_charge || 0) <= 0 && !(Number(S.free_delivery_above || 0) > 0) ? 'told on the call' : 'Free');
    $('#coTotal').textContent = money(sub + del);
    if (mode === 'COLLECT') $('#coDelNote').textContent = 'We keep the pieces aside once confirmed — bring the order number.';
    else paintDelivery($('#coDelNote'), sub);   // P167
    const eta = $('.eta-co'); if (eta) eta.hidden = mode === 'COLLECT' || !cart.lines.length;   // P154 — no courier, no date
    $('#coSubmit').disabled = submitting || !cart.lines.length;
  };
  let submitting = false;
  form.querySelectorAll('[name=delivery]').forEach(r => r.onchange = paint);
  document.addEventListener('bgc:cart', paint);           // P154 — a change in the drawer changes "Your order" too
  if (cart.lines.length) pixel('InitiateCheckout', { value: cart.subtotal(), currency: 'PKR', num_items: cart.count(), content_ids: cart.lines.map(l => l.pack ? 'pack:' + l.slug : l.code) });
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
    const btn = $('#coSubmit'); btn.disabled = true; btn.textContent = 'Placing your order…'; submitting = true;
    try {
      if (window.turnstile && !turnstileToken) { try { await new Promise((res, rej) => { window.onTurnstile = t => { turnstileToken = t; res(); }; turnstile.execute(); setTimeout(rej, 15000); }); } catch { /* server decides */ } }
      const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, lines: cart.lines.filter(l => !l.pack).map(l => ({ variant_id: l.variant_id, qty: l.qty })),
        packs: cart.lines.filter(l => l.pack).map(l => ({ deal: l.slug, size: l.size, mode: l.mode, theme: l.theme, colours: l.colours, qty: l.qty, price: l.price })),   // P141
        utm: utmData(), turnstile: turnstileToken }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.error === 'VALIDATION') showErrors(j.fields);
        else if (j.error === 'SOLD_OUT') { err.textContent = 'Sold out since you added it: ' + (j.items || []).map(i => `${i.name || ''} ${i.size || ''}`.trim()).filter(Boolean).join(', ') + '. Remove those pieces and try again.'; err.hidden = false; (j.items || []).forEach(i => cart.setQty('v' + Number(i.variant_id), 0));
          if ((j.packs || []).length) err.textContent = j.message; paint(); }
        else if (j.error === 'PRICE_CHANGED') {   // P141 — the new price is quoted, never charged silently
          for (const p of j.packs || []) cart.lines.filter(l => l.pack && l.slug === p.deal && l.size === p.size).forEach(l => { l.price = Number(p.price); });
          cart.save(); err.textContent = j.message; err.hidden = false; paint();
        }
        else if (j.error === 'BAD_PACK') { err.textContent = j.message; err.hidden = false; }
        else { err.textContent = j.message || 'The order could not be placed. Please try again or order on WhatsApp.'; err.hidden = false; }
        submitting = false; btn.disabled = !cart.lines.length; btn.textContent = 'Place order'; turnstileToken = '';   /* P154 — a sold-out refusal can empty the cart */ if (window.turnstile) try { turnstile.reset(); } catch { /* */ }
        return;
      }
      store.set('bgc_customer', { name: f.name, phone: f.phone, alt_phone: f.alt_phone, address: f.address, city: f.city, province: f.province });
      // P154 — the Purchase event is sent by the THANKS page (below), once: sent here, one line before the page is
      // sent away, the browser often cancelled it. A pack's id is 'pack:<slug>' (it has no STY code).
      store.set('bgc_last_order', { no: j.no, phone: f.phone, total: j.total, lines: j.lines, packs: j.packs || [], delivery_charge: j.delivery_charge, delivery: f.delivery,
        px: { ids: cart.lines.map(l => l.pack ? 'pack:' + l.slug : l.code), items: cart.count(), sent: false } });
      const kept = store.get('bgc_last_order');
      if (!kept || kept.no !== j.no) pixel('Purchase', { value: j.total, currency: 'PKR', content_ids: cart.lines.map(l => l.pack ? 'pack:' + l.slug : l.code), content_type: 'product', num_items: cart.count(), order_id: j.no });   // P154 — storage refused: the thanks page will not see it
      track('order', { l: j.no, v: j.total, now: true });
      cart.clear();
      location.href = '/thanks/' + j.no + '/';
    } catch {
      err.textContent = 'No connection — please check your internet and try again.'; err.hidden = false; submitting = false; btn.disabled = !cart.lines.length; btn.textContent = 'Place order';
    }
  };
}

// ── thanks ───────────────────────────────────────────────────────────────────
if (document.body.classList.contains('p-thanks')) {
  const last = store.get('bgc_last_order'), no = window.PAGE && window.PAGE.no;
  if (last && last.no === no && $('#thanksLines')) {
    const collect = last.delivery === 'COLLECT';
    $('#thanksLines').innerHTML = `<div class="order-box">${(last.lines || []).map(l => `<div class="row"><span>${esc(l.name)} · ${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''} × ${l.qty}</span><strong>${money(l.price * l.qty)}</strong></div>`).join('')}${packRows(last.packs)}
      <div class="row"><span>${collect ? 'Collect from the shop' : 'Delivery'}</span><strong>${collect ? 'Rs 0' : last.delivery_charge ? money(last.delivery_charge) : 'Free'}</strong></div><div class="row total"><span>${collect ? 'Total to pay at the shop' : 'Total to pay on delivery'}</span><strong>${money(last.total)}</strong></div></div>`;
    // P154 — the number she typed, back in front of her: a wrong digit is caught now, not by a call that never connects
    const ph = $('#thanksPhone');
    if (ph && last.phone) { ph.innerHTML = `We will call <strong>${esc(last.phone)}</strong> to confirm. Wrong number? <a href="${esc(waHref(`Hi, my order ${no} has the wrong phone number. The right one is: `))}" target="_blank" rel="noopener">Tell us on WhatsApp</a>`; ph.hidden = false; }
    if (collect) { const e = $('.eta-thanks'); if (e) e.hidden = true; }
    // P154 — the Purchase event, sent here, once per order (the checkout used to send it as it left the page)
    if (last.px && !last.px.sent) {
      pixel('Purchase', { value: last.total, currency: 'PKR', content_ids: last.px.ids, content_type: 'product', num_items: last.px.items, order_id: no });   // P161: one order, counted once
      store.set('bgc_last_order', { ...last, px: { ...last.px, sent: true } });
    }
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
      <div class="order-box">${j.lines.map(l => `<div class="row"><span>${esc(l.name)} · ${esc(l.size)}${l.colour && l.colour.toLowerCase() !== 'standard' ? ' · ' + esc(l.colour) : ''} × ${l.qty}</span><strong>${money(l.price * l.qty)}</strong></div>`).join('')}${packRows(j.packs)}<div class="row total"><span>Total</span><strong>${money(j.total)}</strong></div></div>`;
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

// ── P165 — reviews (Fahad, 2026-09-28: "online only, approve genuine ones, photos later") ──────────────────────
// The stars, the form, and the "rate your order" page. The server checks the number against a delivered order;
// this only collects and says what happened. The bot check is loaded the first time a review is sent, never on
// page load, so a product page is no heavier for the parent who only looks.
const RV_WORDS = ['', 'Poor', 'Not great', 'OK', 'Good', 'Loved it'];
let tsLoad = null, tsId = null, tsWait = null;
async function botToken(host) {
  if (!S.turnstile) return '';
  try {
    if (!window.turnstile) {
      tsLoad = tsLoad || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      await tsLoad;
    }
    return await new Promise(res => {
      const timer = setTimeout(() => { tsWait = null; res(''); }, 15000);
      tsWait = t => { clearTimeout(timer); tsWait = null; res(t || ''); };
      if (tsId == null) {
        const d = document.createElement('div'); d.className = 'rv-ts'; host.appendChild(d);
        tsId = window.turnstile.render(d, { sitekey: S.turnstile, execution: 'execute', callback: t => tsWait && tsWait(t), 'error-callback': () => tsWait && tsWait('') });
      } else window.turnstile.reset(tsId);
      window.turnstile.execute(tsId);
    });
  } catch { return ''; }            // the server decides
}
function wireStars(form) {
  const btns = $$('.rv-star', form), word = $('.rv-pick-word', form);
  form._stars = 0;
  const paint = n => { btns.forEach(b => { const on = Number(b.dataset.star) <= n; b.classList.toggle('on', on); b.setAttribute('aria-checked', Number(b.dataset.star) === n ? 'true' : 'false'); }); if (word) word.textContent = RV_WORDS[n] || ''; };
  btns.forEach(b => {
    b.onclick = () => { form._stars = Number(b.dataset.star); paint(form._stars); };
    b.onmouseenter = () => paint(Number(b.dataset.star));
    b.onmouseleave = () => paint(form._stars);
  });
}
/** send one review; resolves true when the shop has it */
async function sendReview(form, extra) {
  const err = $('.co-err', form), btn = $('button[type=submit]', form);
  const say = m => { err.textContent = m; err.hidden = !m; };
  say('');
  if (!form._stars) return say('Tap the stars first — one to five.'), false;
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const token = await botToken(form);
    const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: form.dataset.code, stars: form._stars, text: form.text ? form.text.value : '', website: form.website ? form.website.value : '', turnstile: token, ...extra }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      track('review', { label: form.dataset.code, value: form._stars });
      const done = document.createElement('div'); done.className = 'rv-done'; done.textContent = j.message || 'Thank you!';
      form.replaceWith(done);
      return true;
    }
    say(j.fields ? Object.values(j.fields).join(' ') : (j.message || 'Could not send it — please try again.'));
  } catch { say('No connection — please try again.'); }
  btn.disabled = false; btn.textContent = 'Send review';
  return false;
}
(function productReviews() {
  const sec = $('#reviews'); if (!sec) return;
  const more = $('#rvMore', sec);
  if (more) more.onclick = () => { $$('.rv-item[hidden]', sec).forEach(x => { x.hidden = false; }); more.remove(); };
  const form = $('#rvForm', sec), open = $('#rvWrite', sec);
  if (!form || !open) return;
  wireStars(form);
  open.onclick = () => { form.hidden = false; open.hidden = true; const first = $('.rv-star', form); if (first) first.focus(); track('review_open', { label: form.dataset.code }); };
  form.onsubmit = e => { e.preventDefault(); sendReview(form, { name: form.name.value, city: form.city.value, phone: form.phone.value }); };
})();
(function reviewOrderPage() {
  const f = $('#rvOrderForm'); if (!f) return;
  const PG = window.PAGE || {}, out = $('#rvOrderOut'), err = $('#rvOrderErr');
  f.onsubmit = async e => {
    e.preventDefault();
    err.hidden = true;
    const phone = f.phone.value, btn = $('button', f);
    btn.disabled = true;
    try {
      const res = await fetch('/api/reviews/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ no: PG.reviewOrder, phone }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = j.message || 'Could not find that order.'; err.hidden = false; return; }
      f.hidden = true;
      out.innerHTML = `<div class="rvo-who"><label>First name <input id="rvoName" maxlength="40" value="${esc(j.name)}"></label><label>City <input id="rvoCity" maxlength="40" value="${esc(j.city)}"></label></div>
        <p class="muted small">Only your first name and city are shown with your review.</p>
        <div class="rvo-list">${j.items.map(it => `<div class="rvo-item">${it.cover ? `<img src="/${esc(it.cover)}" alt="" loading="lazy" width="72" height="90">` : '<span></span>'}
          <div><h3><a href="/p/${esc(it.slug)}/">${esc(it.name)}</a></h3>${it.reviewed ? '<div class="rv-done">Reviewed — thank you!</div>' : ''}</div>
          ${it.reviewed ? '' : (PG.reviewForm || '').replace('data-code=""', `data-code="${esc(it.code)}"`)}</div>`).join('') || '<p class="muted">None of the pieces in this order are on the website any more.</p>'}</div>`;
      $$('.rv-form', out).forEach(form => {
        wireStars(form);
        form.onsubmit = ev => { ev.preventDefault(); sendReview(form, { phone, name: $('#rvoName').value, city: $('#rvoCity').value }); };
      });
    } catch { err.textContent = 'No connection — please try again.'; err.hidden = false; }
    finally { btn.disabled = false; }
  };
})();

// ── P166 — the search icon in a phone's product-page header opens the box (and the menu) and puts the cursor in it
(function headerSearch() {
  const b = $('#hdrSearchBtn'), hdr = $('.hdr');
  if (!b || !hdr) return;
  b.onclick = () => {
    const open = hdr.classList.toggle('s-open');
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    const box = $('.hdr-search input'); if (open && box) box.focus();
  };
})();
