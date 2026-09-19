// P100 — where a visit came from. Pure and dependency-free so the tests can
// drive every rule without a browser or a database.
//
// The order matters: an explicit tag beats a referrer, and a referrer beats a
// guess from the user agent. The guess is last but it is not optional — a tap
// inside the TikTok or Instagram app usually arrives with NO referrer at all,
// and without this step the shop's two biggest channels would land in "direct".

/** utm_source (any spelling the shop might type) → the canonical channel */
const SOURCES = {
  tiktok: 'TikTok', tt: 'TikTok', tik_tok: 'TikTok',
  facebook: 'Facebook', fb: 'Facebook', meta: 'Facebook',
  instagram: 'Instagram', ig: 'Instagram', insta: 'Instagram',
  youtube: 'YouTube', yt: 'YouTube',
  whatsapp: 'WhatsApp', wa: 'WhatsApp', wapp: 'WhatsApp',
  google: 'Google', 'google-ads': 'Google', adwords: 'Google',
  snapchat: 'Snapchat', snap: 'Snapchat',
  twitter: 'X', x: 'X',
  sms: 'SMS', email: 'Email', mail: 'Email',
};

/** a referrer host → the channel it stands for; longest suffix wins */
const HOSTS = [
  ['tiktok.com', 'TikTok'], ['vt.tiktok.com', 'TikTok'], ['vm.tiktok.com', 'TikTok'],
  ['facebook.com', 'Facebook'], ['fb.me', 'Facebook'], ['fb.com', 'Facebook'], ['fb.watch', 'Facebook'],
  ['instagram.com', 'Instagram'],
  ['youtube.com', 'YouTube'], ['youtu.be', 'YouTube'],
  ['wa.me', 'WhatsApp'], ['whatsapp.com', 'WhatsApp'],
  ['google.com', 'Google'], ['google.com.pk', 'Google'], ['googleadservices.com', 'Google'],
  ['bing.com', 'Search'], ['duckduckgo.com', 'Search'], ['yahoo.com', 'Search'], ['ecosia.org', 'Search'],
  ['snapchat.com', 'Snapchat'], ['t.co', 'X'], ['twitter.com', 'X'], ['x.com', 'X'],
  ['pinterest.com', 'Pinterest'], ['linkedin.com', 'LinkedIn'], ['reddit.com', 'Reddit'],
];

/** the in-app browsers, by the marker each one leaves in the user agent */
const APPS = [
  [/bytedancewebview|musical_ly|; *trill|tiktok/i, 'TikTok'],
  [/instagram/i, 'Instagram'],
  [/fbav|fban|fb_iab|fbios|\[fb/i, 'Facebook'],
  [/whatsapp/i, 'WhatsApp'],
  [/snapchat/i, 'Snapchat'],
  [/twitter/i, 'X'],
  [/line\//i, 'Line'],
];

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|curl|wget|python-requests|scrapy|semrush|ahrefs|monitor|uptime/i;

export const isBot = ua => !ua || BOTS.test(String(ua));

/** the app whose browser this is, or '' */
export function appOf(ua) {
  const s = String(ua || '');
  for (const [re, name] of APPS) if (re.test(s)) return name;
  return '';
}

/** phone / tablet / computer, coarsely — enough to know if the site must work on a phone */
export function deviceOf(ua) {
  const s = String(ua || '');
  if (/ipad|tablet|playbook|silk/i.test(s)) return 'tablet';
  if (/mobi|android|iphone|ipod|phone/i.test(s)) return 'phone';
  return 'computer';
}

export const hostOf = url => { try { return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/** paid or organic: the medium is the authority, a click id only helps */
export function isPaid({ medium, query = {} } = {}) {
  const m = String(medium || '').toLowerCase();
  if (['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'paid-social', 'ads', 'ad', 'display'].includes(m)) return true;
  // gclid and ttclid are only ever put there by an ad click; fbclid is NOT —
  // an ordinary post shared on Facebook carries one too, so it proves nothing.
  return !!(query.gclid || query.ttclid);
}

/**
 * The channel for a session.
 * @param {object} a  { source, medium, referrer, ua, selfHost, query }
 * @returns {{channel, source, medium, referrer_host, app, device, paid}}
 */
export function attribute({ source, medium, referrer, ua, selfHost, query = {} } = {}) {
  const app = appOf(ua), device = deviceOf(ua);
  const rHost = hostOf(referrer);
  const self = String(selfHost || '').replace(/^www\./, '').toLowerCase();
  // our own pages are not a source: the session simply carried on
  const external = rHost && rHost !== self && !(self && rHost.endsWith('.' + self));
  const src = String(source || '').trim().toLowerCase();
  let channel = '';
  if (src) channel = SOURCES[src] || (source.length <= 40 ? String(source).trim() : 'Other');
  if (!channel && external) {
    let best = '';
    for (const [h, name] of HOSTS) if ((rHost === h || rHost.endsWith('.' + h)) && h.length > best.length) { best = h; channel = name; }
    if (!channel) channel = rHost;                      // a real site we do not know: keep its name
  }
  if (!channel && app) channel = app;
  // WhatsApp strips the referrer, so an untagged arrival is very often WhatsApp.
  // Calling this bucket "Direct" would quietly hide the shop's biggest channel.
  if (!channel) channel = 'Direct or WhatsApp';
  return { channel, source: source || '', medium: medium || '', referrer_host: external ? rHost : '', app, device, paid: isPaid({ medium, query }) };
}
