// P169 — the shop's promises, set once (Fahad, 2026-09-29: "control everything … from a main panel so that whole site
// stays identical"). The exchange period, the delivery days, the courier's day off and the confirmation call are
// settings (Settings ▸ Website; the main panel in P170). Every sentence the website says about them is written here,
// and only here: the footer, the promise tiles, the item pages, the checkout, the thanks page, Google's text. A
// catalogue published before these settings existed reads as the shop's rules were then: 15 days, 3–5, Sunday, a call.
const DAY = { SUNDAY: 0, FRIDAY: 5, SATURDAY: 6 };
const DAY_PLURAL = { SUNDAY: 'Sundays', FRIDAY: 'Fridays', SATURDAY: 'Saturdays' };

export function rules(store = {}) {
  const exchange = store.exchange_days == null ? 15 : Math.max(0, Number(store.exchange_days) || 0);
  const min = Math.max(1, Number(store.delivery_days_min || 3));
  const max = Math.max(min, Number(store.delivery_days_max || 5));
  const closed = store.closed_day === undefined ? 'SUNDAY' : (DAY[store.closed_day] != null ? store.closed_day : 'NONE');
  return { exchange, min, max, closed, closedDow: closed === 'NONE' ? -1 : DAY[closed], callFirst: store.call_first !== false };
}
/** "3–5 working days", or "4 working days" when the two are the same */
export const daysText = store => { const r = rules(store); return r.min === r.max ? `${r.min} working day${r.min === 1 ? '' : 's'}` : `${r.min}–${r.max} working days`; };
/** "(Sundays not counted)", or nothing when every day counts */
export const closedText = store => { const r = rules(store); return r.closed === 'NONE' ? '' : `(${DAY_PLURAL[r.closed]} not counted)`; };
/** what the site says about delivery time, in each place it says it */
export const eta = {
  line: store => `Delivered in ${daysText(store)}${closedText(store) ? ' ' + closedText(store) : ''}.`,
  detail: store => `${daysText(store)}${closedText(store) ? ' ' + closedText(store) : ''}`,
  plain: store => `delivered in ${daysText(store)}`,
};
/** what the site says about exchanges, in each place — all empty when the shop promises none */
export const exchange = {
  footer: store => rules(store).exchange ? `Exchange within ${rules(store).exchange} days of delivery — unworn, with the tag.` : '',
  tileTitle: store => rules(store).exchange ? `${rules(store).exchange}-day exchange` : '',
  tileText: store => rules(store).exchange ? `Wrong size? Exchange within ${rules(store).exchange} days of delivery, tag on.` : '',
  detail: store => rules(store).exchange ? `Within ${rules(store).exchange} days of delivery, unworn with the tag.` : '',
  sentence: store => rules(store).exchange ? `Exchange within ${rules(store).exchange} days of delivery, unworn with the tag.` : '',
  short: store => rules(store).exchange ? `exchange within ${rules(store).exchange} days` : '',
  policy: store => rules(store).exchange ? `our ${rules(store).exchange}-day exchange policy` : '',
};
/** what the site says about the confirmation call — all empty when the shop does not promise one */
export const call = {
  footer: store => rules(store).callFirst ? 'We call to confirm every order before it is dispatched.' : '',
  tileTitle: () => 'We call first',
  tileText: () => 'Every order is confirmed by phone before it leaves the shop.',
  detail: store => rules(store).callFirst ? 'We call to confirm every order.' : '',
  phoneHint: store => rules(store).callFirst ? 'We call this number to confirm the order.' : '',
  thanksStep: store => rules(store).callFirst ? ['We call you', 'on the number you gave, usually within a few hours during shop time, to confirm the pieces and the address.'] : null,
  trackNew: store => rules(store).callFirst ? 'Received — we will call you to confirm' : 'Received — being checked',
  chargeNote: store => rules(store).callFirst ? 'Delivery charge is confirmed on the call.' : 'Delivery charge is confirmed before dispatch.',
  thanksPhone: store => rules(store).callFirst ? 'We will call {phone} to confirm.' : 'Your number: {phone}.',
  checkoutHead: store => rules(store).callFirst ? 'We call this number to confirm before dispatch.' : 'We send the parcel to this number.',
  on: store => rules(store).callFirst,
};
/**
 * P170 — a site-wide feature, switched on the Website panel: reviews, recommend, wa_bubble, eta, fits, quick_filters.
 * On unless switched off (a catalogue from before the switches has none, and shows everything, as it did).
 */
export const feat = (store, name) => !(store && store.features && store.features[name] === false);
/** the numbers the browser needs to count the delivery dates */
/** the few sentences the browser writes itself (the cart's delivery note, the thanks page's number) */
export const wordsForPage = store => ({ charge_note: call.chargeNote(store), thanks_phone: call.thanksPhone(store), charge_label: rules(store).callFirst ? 'told on the call' : 'confirmed before dispatch' });
export const etaForPage = store => { if (!feat(store, 'eta')) return null; const r = rules(store); return { min: r.min, max: r.max, closed: r.closedDow, text: `${daysText(store)}${r.closed === 'NONE' ? '' : `, ${DAY_PLURAL[r.closed]} not counted`}.` }; };
