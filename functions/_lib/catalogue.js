// The catalogue the POS published (site/data/catalogue.json), read through the
// static-asset binding and kept for a minute per isolate. Everything the pages
// show comes from here — a price, a product or a policy never needs a code change.
let cache = { at: 0, data: null, etag: null };
const TTL = 60 * 1000;

export async function loadCatalogue(context) {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL) return cache.data;
  const url = new URL('/data/catalogue.json', context.request.url);
  const res = await context.env.ASSETS.fetch(new Request(url.toString(), { headers: cache.etag ? { 'If-None-Match': cache.etag } : {} }));
  if (res.status === 304 && cache.data) { cache.at = now; return cache.data; }
  if (!res.ok) throw new Error('catalogue not published yet');
  const data = await res.json();
  cache = { at: now, data: index(data), etag: res.headers.get('etag') };
  return cache.data;
}

/** derived lookups the pages use, computed once per load */
function index(data) {
  const products = data.products || [];
  const bySlug = new Map(products.map(p => [p.slug, p]));
  const byVariant = new Map();
  for (const p of products) for (const v of p.variants || []) byVariant.set(Number(v.id), { p, v });
  const collections = (data.collections || []).map(c => ({ ...c, items: (c.products || []).map(code => products.find(p => p.code === code)).filter(Boolean) }));
  const parents = [];
  for (const c of data.categories || []) {
    const pname = c.parent || c.name;
    let par = parents.find(x => x.name === pname);
    if (!par) { par = { name: pname, slug: slugify(pname), children: [] }; parents.push(par); }
    if (c.parent) par.children.push(c);
  }
  const agentCodes = new Set(data.agent_codes || []);
  return { ...data, products, bySlug, byVariant, collections, parents, agentCodes };
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

/** the products a category page lists: a parent's slug matches every child */
export function productsIn(cat, slug) {
  const par = cat.parents.find(p => p.slug === slug);
  if (par) return cat.products.filter(p => slugify(p.category_parent || p.category) === slug);
  const c = (cat.categories || []).find(x => x.slug === slug);
  if (!c) return null;
  return cat.products.filter(p => p.category === c.name && (p.category_parent || null) === (c.parent || null));
}

export function categoryTitle(cat, slug) {
  const par = cat.parents.find(p => p.slug === slug);
  if (par) return par.name;
  const c = (cat.categories || []).find(x => x.slug === slug);
  return c ? (c.parent ? `${c.parent} · ${c.name}` : c.name) : null;
}

/** availability of a whole product: in / few / out */
export function productAvailability(p) {
  const a = (p.variants || []).map(v => v.availability);
  if (a.some(x => x === 'in')) return 'in';
  if (a.some(x => x === 'few')) return 'few';
  return 'out';
}

/** paisa never leave the POS as floats; here prices are whole rupees or two-decimal — keep them exact */
export function money(n) {
  const x = Number(n || 0);
  return 'Rs ' + (Number.isInteger(x) ? x.toLocaleString('en-PK') : x.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

export function priceLabel(p) {
  return p.price_min === p.price_max ? money(p.price_min) : `${money(p.price_min)} – ${money(p.price_max)}`;
}

/** the delivery rule, as the POS set it: free above an amount, a flat charge below it; 0 = "told on the call" */
export function deliveryCharge(store, subtotal, mode) {
  if (mode === 'COLLECT') return 0;
  const free = Number(store.free_delivery_above || 0), charge = Number(store.delivery_charge || 0);
  if (charge <= 0) return 0;
  if (free > 0 && subtotal >= free) return 0;
  return charge;
}

/** "Standard" is the POS's placeholder colour for garments that have no colour — never shown */
export function realColours(p) {
  return (p.colours || []).filter(c => c.name && c.name.toLowerCase() !== 'standard');
}
