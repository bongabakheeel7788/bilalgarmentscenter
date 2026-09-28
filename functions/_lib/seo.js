// P164 — what Google reads (Fahad, 2026-09-28: "optimize the product pages, categories and all pages for SEO").
// Words for every product (the shop's own, else written from the product's facts), and the structured data each
// page carries. Structured data only ever describes what the page itself says — Google's rule, and ours.
import { money, priceLabel, realColours, deliveryCharge, ageName } from './catalogue.js';

const WHO = { boys: 'boys', girls: 'girls', unisex: 'boys and girls', gents: 'men', ladies: 'women' };
const SEASON = { SUMMER: 'summer', PRE_WINTER: 'the start of winter', WINTER: 'winter', ALL: 'every season' };
export const EXCHANGE_TEXT = 'Exchange within 15 days of delivery, unworn with the tag.';

export const siteOf = store => String((store && store.site_url) || '').replace(/\/$/, '');
/** a meta description: whole words, about 155 characters */
export function clip(s, n = 155) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1); return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)).replace(/[\s,;:—–-]+$/, '') + '…';
}
/** one JSON-LD block; `<` escaped so no text in it can close the script */
export const ldTag = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

/** the product's facts as plain sentences — never a claim the page does not make */
export function productFacts(p, store) {
  const who = WHO[String(p.gender || '').toLowerCase()];
  const out = [`${p.name}.`];
  // the kind as the shop names it ("Frocks", "Casual Shirts"), who it is for, the fabric
  const kind = [p.category || '', who ? `for ${who}` : ''].filter(Boolean).join(' ');
  if (kind || p.fabric) out.push(`${kind || 'Made'}${p.fabric ? `, in ${String(p.fabric).toLowerCase()}` : ''}.`);
  if (p.set_contents) out.push(`The set: ${p.set_contents}.`);
  const sizes = p.sizes || [];
  if (sizes.length) {
    const ages = p.size_ages || {}, free = p.size_free || {};
    const one = z => free[z] ? `${z} (${free[z]})` : ages[z] ? `${z} (${ages[z]})` : z;
    out.push(`${sizes.length === 1 ? 'Size' : 'Sizes'} ${sizes.map(one).join(', ')}${p.age_range ? `; fits ${p.age_range}` : ''}.`);
  }
  const colours = realColours(p).map(c => c.name);
  if (colours.length) out.push(`${colours.length === 1 ? 'Colour' : 'Colours'}: ${colours.join(', ')}.`);
  if (p.season && SEASON[p.season]) out.push(`Made for ${SEASON[p.season]}.`);
  out.push(`${priceLabel(p)}, cash on delivery all over Pakistan, delivered in 3–5 working days. ${EXCHANGE_TEXT}`);
  return out.join(' ');
}
/** the words on the page and in the data: the shop's own first, then the facts */
export function productText(p, store) {
  const facts = productFacts(p, store);
  return { own: p.description ? String(p.description).trim() : '', facts, all: [p.description ? String(p.description).trim() : '', facts].filter(Boolean).join(' ') };
}

export function breadcrumbLd(store, trail) {
  const site = siteOf(store);
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: site + t.href })) };
}

const returnPolicy = () => ({ '@type': 'MerchantReturnPolicy', applicableCountry: 'PK', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 15, refundType: 'https://schema.org/ExchangeRefund' });

export function productLd(p, store, { photos, url, text, availability }) {
  const site = siteOf(store);
  const avail = availability === 'out' ? 'https://schema.org/OutOfStock' : availability === 'few' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock';
  const one = Number(p.price_min) === Number(p.price_max);
  const charge = p.free_delivery ? 0 : deliveryCharge(store || {}, Number(p.price_min || 0), 'DELIVERY');   // P168 — free whatever the price
  // a charge of 0 with no free-delivery rule means "told on the call" — nothing to state
  const shipping = (Number(store && store.delivery_charge) > 0 || p.free_delivery) ? { '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: charge, currency: 'PKR' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'PK' },
    deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 5, unitCode: 'DAY' } } } : null;
  const offers = one
    ? { '@type': 'Offer', price: Number(p.price_min), priceCurrency: 'PKR', availability: avail, itemCondition: 'https://schema.org/NewCondition', url,
        ...(shipping ? { shippingDetails: shipping } : {}), hasMerchantReturnPolicy: returnPolicy(), seller: { '@type': 'Organization', name: store.name } }
    : { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: Number(p.price_min), highPrice: Number(p.price_max), offerCount: (p.variants || []).length, availability: avail, url };
  return { '@context': 'https://schema.org', '@type': 'Product', name: p.name, productID: p.code, url,   // the style code the page shows; never a POS stock code (97g guards the word)
    image: photos.map(x => `${site}/${String(x).replace(/^\//, '')}`), description: text,
    brand: { '@type': 'Brand', name: store.name }, ...(p.category ? { category: [p.category_parent, p.category].filter(Boolean).join(' > ') } : {}),
    ...(realColours(p).length ? { color: realColours(p).map(c => c.name).join(', ') } : {}),
    ...(p.fabric ? { material: p.fabric } : {}), offers,
    // P165 — only real, approved reviews, and only once there is one: never made up, never a default
    ...(p.rating && p.rating.count > 0 ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.avg, reviewCount: p.rating.count, bestRating: 5, worstRating: 1 },
      review: (p.reviews || []).slice(0, 10).map(r => ({ '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: r.stars, bestRating: 5, worstRating: 1 },
        author: { '@type': 'Person', name: r.name }, ...(r.date ? { datePublished: r.date } : {}), ...(r.text ? { reviewBody: r.text } : {}) })) } : {}) };
}

/** the shop itself — on the home page and the Visit page */
export function storeLd(store) {
  const site = siteOf(store);
  const wa = String(store.whatsapp_intl || '').replace(/\D/g, '');
  return { '@context': 'https://schema.org', '@type': 'ClothingStore', name: store.name, url: site + '/',
    ...(store.logo ? { logo: `${site}/${String(store.logo).replace(/^\//, '')}`, image: `${site}/${String(store.logo).replace(/^\//, '')}` } : { image: `${site}/og-default.png` }),
    ...(store.tagline ? { description: store.tagline } : {}),
    ...(wa ? { telephone: '+' + wa } : {}),
    ...(store.address ? { address: { '@type': 'PostalAddress', streetAddress: store.address, addressCountry: 'PK' } } : {}),
    ...(store.map_url ? { hasMap: store.map_url } : {}),
    areaServed: { '@type': 'Country', name: 'Pakistan' }, currenciesAccepted: 'PKR', paymentAccepted: 'Cash on delivery',
    hasMerchantReturnPolicy: returnPolicy() };
}

/** a listing's items, in page order (the first 30 — what a crawler reads first) */
export function itemListLd(store, products) {
  const site = siteOf(store);
  return { '@context': 'https://schema.org', '@type': 'ItemList', numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: site + (p.href || `/p/${p.slug}/`), name: p.name })) };
}

/** the line under a listing's title: how many, the prices, the ages, how to pay */
export function listIntro(cat, products) {
  const n = products.length;
  if (!n) return '';
  const lo = Math.min(...products.map(p => Number(p.price_min || 0))), hi = Math.max(...products.map(p => Number(p.price_max || p.price_min || 0)));
  const months = products.map(p => p.age_months).filter(Array.isArray);
  const a = months.length ? ageName(cat, Math.min(...months.map(m => m[0]))) : null;
  const b = months.length ? ageName(cat, Math.max(...months.map(m => m[1]))) : null;
  const ages = a && b ? (a === b ? `, fits ${a}` : `, ages ${a} to ${b}`) : '';
  const price = lo > 0 ? (lo === hi ? `, ${money(lo)}` : `, ${money(lo)} to ${money(hi)}`) : '';
  return `${n} piece${n === 1 ? '' : 's'}${price}${ages}. Cash on delivery all over Pakistan; exchange within 15 days.`;
}
