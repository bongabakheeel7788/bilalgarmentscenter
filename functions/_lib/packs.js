// P141 — a pack in the cart, checked against the published catalogue. The site prices a pack from the
// catalogue, never from the cart; a price that changed since the customer added it is quoted back to her
// instead of being charged silently. Mixed needs a pack in stock; a theme needs each of its colours; "choose my
// own" needs exactly the pack's pieces, each colour within what the shop published it can pick.
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * body: { deal: slug, size, mode: MIXED|THEME|OWN, theme?, colours?: { name: n }, qty?, price? }
 * → { line } or { error: 'SOLD_OUT' | 'PRICE_CHANGED' | 'BAD_PACK', message, … }
 */
export function checkPack(cat, body) {
  const b = body && typeof body === 'object' ? body : {};
  const d = cat.dealBySlug && cat.dealBySlug.get(clean(b.deal, 80));
  if (!d) return { error: 'SOLD_OUT', message: 'That pack is no longer offered.' };
  const z = (d.sizes || []).find(x => x.size === clean(b.size, 20));
  if (!z) return { error: 'SOLD_OUT', message: `${d.name}: that size is no longer offered.` };
  const qty = Math.floor(Number(b.qty) || 1);
  if (qty < 1 || qty > 3) return { error: 'BAD_PACK', message: 'Up to 3 of one pack per order — for more, ask us on WhatsApp.' };
  if (z.packs < qty) return { error: 'SOLD_OUT', message: z.packs ? `${d.name} size ${z.size}: only ${z.packs} pack${z.packs === 1 ? '' : 's'} can be made right now.` : `${d.name} size ${z.size} has sold out.` };
  const mode = ['MIXED', 'THEME', 'OWN'].includes(b.mode) ? b.mode : 'MIXED';
  const have = new Map((z.colours || []).map(c => [c.name, c.max]));
  let choice = { mode: 'MIXED' };
  if (mode === 'THEME') {
    const t = (d.themes || []).find(x => x.name === clean(b.theme, 40));
    if (!t) return { error: 'BAD_PACK', message: `${d.name}: that theme is no longer offered.` };
    const each = d.pieces / t.colours.length;
    const short = t.colours.filter(c => (have.get(c) || 0) < each * qty);
    if (short.length) return { error: 'SOLD_OUT', message: `${d.name} “${t.name}” in size ${z.size}: not enough ${short.join(', ')} right now.` };
    choice = { mode, theme: t.name, colours: t.colours.slice() };
  } else if (mode === 'OWN') {
    if (!d.choose_own) return { error: 'BAD_PACK', message: `${d.name} comes in mixed colours only.` };
    const picked = Object.entries(b.colours && typeof b.colours === 'object' ? b.colours : {})
      .map(([name, n]) => ({ colour: clean(name, 40), n: Math.floor(Number(n) || 0) })).filter(x => x.n > 0);
    const total = picked.reduce((s, x) => s + x.n, 0);
    if (total !== d.pieces) return { error: 'BAD_PACK', message: `${d.name}: choose exactly ${d.pieces} colours — ${total} chosen.` };
    const over = picked.filter(x => (have.get(x.colour) || 0) < x.n * qty);
    if (over.length) return { error: 'SOLD_OUT', message: `${d.name} size ${z.size}: not enough ${over.map(x => x.colour).join(', ')} right now.` };
    choice = { mode, colours: picked };
  }
  const price = Math.round(Number(z.price) * 100);
  if (b.price != null && Math.round(Number(b.price) * 100) !== price) {
    return { error: 'PRICE_CHANGED', message: `${d.name} size ${z.size} is now Rs ${z.price.toLocaleString('en-PK')}.`, deal: d.slug, size: z.size, price: z.price };
  }
  return { line: { deal_id: d.id, slug: d.slug, name: d.name, size: z.size, size_id: z.size_id || null, pieces: d.pieces, choice, price_paisa: price, qty } };
}
