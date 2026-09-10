// Every HTML route of bilalgarments.center. Static files (css, js, media,
// data) never reach here — site/_routes.json keeps them on the asset host.
import { loadCatalogue } from './_lib/catalogue.js';
import * as pages from './_lib/pages.js';

const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', ...extra } });

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  let path = url.pathname;
  if (path === '/sitemap.xml') { const cat = await loadCatalogue(context).catch(() => null); return new Response(sitemap(cat, url.origin), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } }); }
  // canonical trailing slash for pages (not for files)
  if (!path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path)) return Response.redirect(url.origin + path + '/' + url.search, 301);
  let cat;
  try { cat = await loadCatalogue(context); }
  catch (e) { return html(`<!doctype html><meta charset="utf-8"><title>Opening soon</title><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Opening soon</h1><p>The catalogue has not been published yet.</p>`, 503, { 'Cache-Control': 'no-store' }); }
  const seg = path.split('/').filter(Boolean);
  let out = null;
  if (seg.length === 0) out = pages.home(cat);
  else if (seg[0] === 'new' && seg.length === 1) out = pages.newArrivals(cat);
  else if (seg[0] === 'all' && seg.length === 1) out = pages.all(cat);
  else if (seg[0] === 'c' && seg.length === 2) out = pages.category(cat, seg[1]);
  else if (seg[0] === 'collection' && seg.length === 2) out = pages.collection(cat, seg[1]);
  else if (seg[0] === 'p' && seg.length === 2) out = pages.product(cat, seg[1]);
  else if (seg[0] === 'search' && seg.length === 1) return html(pages.search(cat, url.searchParams.get('q') || ''), 200, { 'Cache-Control': 'no-store' });
  else if (seg[0] === 'checkout' && seg.length === 1) return html(pages.checkout(cat, context.env.TURNSTILE_SITE_KEY || ''), 200, { 'Cache-Control': 'no-store' });
  else if (seg[0] === 'thanks' && seg.length === 2 && /^WEB-\d{6}$/.test(seg[1])) return html(pages.thanks(cat, seg[1]), 200, { 'Cache-Control': 'no-store' });
  else if (seg[0] === 'track' && seg.length === 1) return html(pages.track(cat, url.searchParams.get('no') || ''), 200, { 'Cache-Control': 'no-store' });
  else if (seg[0] === 'visit' && seg.length === 1) out = pages.visit(cat);
  if (out) return html(out);
  return html(pages.notFound(cat), 404, { 'Cache-Control': 'no-store' });
}

function sitemap(cat, origin) {
  const site = (cat && cat.store && cat.store.site_url) ? String(cat.store.site_url).replace(/\/$/, '') : origin;
  const urls = ['/', '/new/', '/all/', '/visit/'];
  if (cat) {
    for (const p of cat.parents) urls.push(`/c/${p.slug}/`);
    for (const c of cat.categories || []) urls.push(`/c/${c.slug}/`);
    for (const c of cat.collections) urls.push(`/collection/${c.slug}/`);
    for (const p of cat.products) urls.push(`/p/${p.slug}/`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${site}${u}</loc></url>`).join('\n')}\n</urlset>`;
}
