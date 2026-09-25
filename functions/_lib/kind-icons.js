// P139 — the homepage tiles' icons and colours. ONE list, in two places that must stay identical:
// storefront/functions/_lib/kind-icons.js (the website draws the tiles) and public/js/kind-icons.js
// (the POS panel where the shop picks them). test/97df compares the two files byte for byte.
// Line icons on a 24×24 grid, drawn in the tile's ink colour; no photographs, no emoji.

export const ICONS = {
  suit:      { label: 'Suit / set',      d: '<path d="M8.5 2.5 4.8 4.4 6.2 7.2l1.3-.6v4.9h9V6.6l1.3.6 1.4-2.8-3.7-1.9"/><path d="M8.5 2.5c.6 1.1 1.9 1.8 3.5 1.8s2.9-.7 3.5-1.8"/><path d="M7.4 13.5h9.2l.6 8h-3.6L12 17.6l-1.6 3.9H6.8z"/>' },
  shirt:     { label: 'Shirt',           d: '<path d="M8.5 3.5 4 6l1.8 3.6 1.7-.8V20.5h9V8.8l1.7.8L20 6l-4.5-2.5"/><path d="M8.5 3.5c.6 1.5 2 2.4 3.5 2.4s2.9-.9 3.5-2.4"/><path d="M12 6v14.5"/>' },
  pants:     { label: 'Pants / trousers', d: '<path d="M7 3.5h10l1.2 17h-4.3L12 10.5l-1.9 10H5.8z"/><path d="M7.1 6.5h9.8"/>' },
  shalwar:   { label: 'Shalwar kameez',  d: '<path d="M9 2.5 5.5 4.3l.9 3.3 1.3-.4L7 16.5h10l-.7-9.3 1.3.4.9-3.3L15 2.5"/><path d="M9 2.5c.5 1.2 1.6 1.9 3 1.9s2.5-.7 3-1.9"/><path d="M12 4.4v4.8"/><path d="M8.6 16.5l-.8 5h3.1l1.1-3.3 1.1 3.3h3.1l-.8-5"/>' },
  tracksuit: { label: 'Tracksuit',       d: '<path d="M8.5 3.5 4 6l1.5 5 1.9-.6v10.1h9.2V10.4l1.9.6L20 6l-4.5-2.5"/><path d="M8.5 3.5c.8 1.6 2 2.3 3.5 2.3s2.7-.7 3.5-2.3"/><path d="M12 5.8v14.7"/><path d="M5 9.2l2.4-.6M19 9.2l-2.4-.6"/>' },
  waist:     { label: 'Waist pants',     d: '<path d="M7 5.5h10l1.2 15h-4.3L12 11.5l-1.9 9H5.8z"/><path d="M6.6 3.5h10.8v2.8H6.6z"/><path d="M11.2 3.5h1.6v2.8h-1.6z"/>' },
  uniform:   { label: 'Uniform',         d: '<path d="M8.5 3.5 4 6l1.8 3.6 1.7-.8V20.5h9V8.8l1.7.8L20 6l-4.5-2.5"/><path d="M8.5 3.5 12 7l3.5-3.5"/><path d="M12 7l-1.1 1.6 1.1 6 1.1-6z"/>' },
  frock:     { label: 'Frock',           d: '<path d="M9.3 2.5h5.4l-.8 5 5.6 13H4.5l5.6-13z"/><path d="M9.3 2.5c.5 1.1 1.4 1.7 2.7 1.7s2.2-.6 2.7-1.7"/><path d="M10.1 7.5h3.8"/>' },
  babykit:   { label: 'Baby kit',        d: '<path d="M8.5 3.5 4.5 6.5l1.7 2.6 1.8-1V14l-1 6.5h3.2L12 17l1.8 3.5H17L16 14V8.1l1.8 1 1.7-2.6-4-3"/><path d="M8.5 3.5c.8 1.3 2 2 3.5 2s2.7-.7 3.5-2"/>' },
  shawl:     { label: 'Shawl / blanket', d: '<path d="M4.5 5.5h15v10.2l-4.3 4.3H4.5z"/><path d="M15.2 20v-4.3h4.3"/><path d="M4.5 9.5h15M4.5 12.5h10.7"/>' },
  towel:     { label: 'Towel',           d: '<path d="M6 3.5h12v17H6z"/><path d="M6 7.5h12M6 16.5h12"/><path d="M9 10.5h6M9 13.5h6"/>' },
  hanky:     { label: 'Handkerchief',    d: '<path d="M5 5h14v14H5z"/><path d="M5 15.5 8.5 19M15.5 5 19 8.5"/><path d="M8 8h8v8H8z" stroke-dasharray="1.6 1.6"/>' },
  fullsize:  { label: 'Long dress',      d: '<path d="M9 2.5 6 4.3l1 3.4 1.5-.4L7.2 21.5h9.6L15.5 7.3l1.5.4 1-3.4-3-1.8"/><path d="M9 2.5c.5 1.2 1.6 1.9 3 1.9s2.5-.7 3-1.9"/><path d="M9 11.5c2 .8 4 .8 6 0"/>' },
  stole:     { label: 'Stole / dupatta', d: '<path d="M7 3.5c1.5 2.4 3.2 3.4 5 3.4s3.5-1 5-3.4"/><path d="M7 3.5 5.5 20.5h4L12 9.8l2.5 10.7h4L17 3.5"/><path d="M6 17.5h3M15 17.5h3"/>' },
  cap:       { label: 'Cap / accessory', d: '<path d="M4.5 15c0-5 3.3-8.5 7.5-8.5s7.5 3.5 7.5 8.5"/><path d="M3 15h13.5c2 0 3.5.8 4.5 2H3z"/><path d="M12 6.5V4.5"/>' },
};

/** [tint, ink, name] — soft grounds, inks dark enough to read on them */
export const SWATCHES = {
  blue: ['#e7eefb', '#2c5aa6', 'Blue'], mint: ['#e2f3eb', '#1d7250', 'Mint'], peach: ['#fcebe0', '#a8502a', 'Peach'],
  lilac: ['#eee7fb', '#6443ad', 'Lilac'], lemon: ['#faf1d3', '#806306', 'Lemon'], rose: ['#fbe5ec', '#a8345a', 'Rose'],
  sky: ['#e0f1f7', '#1b6a82', 'Sky'], sand: ['#f2ece3', '#735a37', 'Sand'],
};

/** the icon as inline SVG, in the given ink */
export function iconSvg(key, ink = 'currentColor', size = 34) {
  const i = ICONS[key] || ICONS.shirt;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${i.d}</svg>`;
}
