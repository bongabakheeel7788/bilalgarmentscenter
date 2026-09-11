'use strict';
// P41 — ONE search rule for every product box in the shop.
//
// Seven screens searched products (Products, Stock Levels, Barcodes, Receive
// Stock, POS, My Day, Returns) and each one matched only the name, the STY code,
// the SKU or an exact barcode — the supplier, category, size group, colours and
// sizes sat on the same screen, invisible to the box. Fahad: "the existing
// search bar should be powerful enough to search products in every way the
// users want" — and one rule everywhere, so a screen never surprises.
//
// The rule:
//   • words, in any order — every word must match SOMETHING about the product
//     ("royal navy 26": supplier + colour + size);
//   • what a product IS: name, STY code, supplier, shopkeeper (P54), category (and its parent),
//     size group, fabric, set contents — and, per variant: SKU, colour, size;
//   • case does not matter; "3piece" finds "Nadeem 3 Piece" (spaces ignored too);
//   • a word that only matches a colour, a size or a SKU narrows to THOSE
//     variants, so the screen can expand or offer just the navy 26;
//   • a whole query that is a barcode (6+ digits) matches that one barcode
//     exactly and nothing else — scanning stays exact, never fuzzy;
//   • no typo tolerance, no price or rack matching (Fahad, 2026-09-06: no).
//
// Two shapes come through here: a PRODUCT with `variants` (or `cells`) — the
// catalogue screens — and a flat POS ITEM (one variant with the product's names
// on it). `matchProduct` takes the first, `matchItem` the second; both return
// null for "no", or { variants: Set|null } — the set names the variants that
// carry the narrowing words (null = the whole product matched).

const norm = s => String(s == null ? '' : s).toLowerCase();
const squash = s => norm(s).replace(/[\s\-_./]+/g, '');
const has = (field, tok, tokSq) => { const f = norm(field); return !!f && (f.includes(tok) || squash(f).includes(tokSq)); };

const PRODUCT_FIELDS = ['name', 'code', 'supplier_name', 'supplier', 'shopkeeper_name', 'category_name', 'category_parent', 'category', 'size_group', 'size_group_name', 'fabric', 'set_contents'];
const VARIANT_FIELDS = ['sku', 'colour', 'size'];

/** split a query into words; returns [] for nothing to search */
export function tokens(q) {
  return String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** the query is one scanned/typed barcode: 6 or more digits and nothing else */
export const isBarcodeQuery = q => /^\d{6,}$/.test(String(q || '').trim());

// P58 — the counter tags. Eight digits starting 99 are never a product (six,
// at most seven); the same table lives in server/lib/barcode.js.
const COMMANDS = { '99000001': 'PAY', '99000002': 'CLEAR', '99000003': 'MINUS' };
/** { kind: 'PAY'|'CLEAR'|'MINUS'|'SP', user_id? } for a command code, else null */
export function commandOf(code) {
  const c = String(code || '').trim();
  if (!/^99\d{6}$/.test(c)) return null;
  if (COMMANDS[c]) return { kind: COMMANDS[c] };
  if (c.startsWith('991')) return { kind: 'SP', user_id: Number(c.slice(3)) };
  return null;
}
/** a scanned burst that is a product tag OR a command — what the routers act on */
export const isScanCode = q => /^\d{6,14}$/.test(String(q || '').trim());

const variantsOf = p => p.variants || p.cells || [];
const idOf = v => v.variant_id != null ? Number(v.variant_id) : Number(v.id);

/**
 * Does this product match the query?  null = no; otherwise
 * { variants: Set<variantId> | null } — the variants the narrowing words point
 * at, or null when every word matched the product itself.
 */
export function matchProduct(p, q) {
  const q0 = String(q || '').trim();
  if (!q0) return { variants: null };
  const vs = variantsOf(p);
  if (isBarcodeQuery(q0)) {
    const hit = vs.filter(v => String(v.barcode || '') === q0);
    return hit.length ? { variants: new Set(hit.map(idOf)) } : null;
  }
  let narrowed = null;                                   // variants that every variant-only word points at
  for (const tok of tokens(q0)) {
    const tokSq = squash(tok);
    if (PRODUCT_FIELDS.some(f => has(p[f], tok, tokSq))) continue;   // the product itself carries the word
    const hits = vs.filter(v => VARIANT_FIELDS.some(f => has(v[f], tok, tokSq)));
    if (!hits.length) return null;                                     // nowhere on this product
    const ids = new Set(hits.map(idOf));
    narrowed = narrowed ? new Set([...narrowed].filter(id => ids.has(id))) : ids;
    if (!narrowed.size) return null;                                   // "navy 26" but no navy IS a 26
  }
  return { variants: narrowed };
}

/** a flat POS item (one variant carrying its product's names): true / false */
export function matchItem(i, q) {
  return !!matchProduct({ name: i.name, code: i.code, supplier_name: i.supplier_name, category_name: i.category_name, category_parent: i.category_parent,
    size_group: i.size_group, fabric: i.fabric, variants: [i] }, q);
}

/** filter a list of products, attaching the narrowed variant set as `_hit` (or null) */
export function filterProducts(products, q) {
  const out = [];
  for (const p of products) { const m = matchProduct(p, q); if (m) out.push(Object.assign(p, { _hit: m.variants })); }
  return out;
}
