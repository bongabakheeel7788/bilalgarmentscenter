// P100 — the visit log, from the page's side. About 2 KB, no dependency, and
// it never blocks anything: events queue up and leave in one batch through
// navigator.sendBeacon, which is delivered even by a tab that is closing.
//
// No cookie is set here. The session id lives in sessionStorage (it dies with
// the tab) and the visitor is worked out on the server as a hash that rotates
// every day — so the shop can count people without following them.
(function () {
  var SS = 'bgc_sid', AS = 'bgc_att', q = [], sending = false;

  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { /* private window */ }
    return null;
  }
  var sid = ss(SS);
  if (!sid) { sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)); ss(SS, sid); }

  // The attribution is read ONCE, on the first page of the session: by the
  // second page document.referrer is our own site and the truth would be lost.
  var att;
  try { att = JSON.parse(ss(AS) || 'null'); } catch (e) { att = null; }
  if (!att) {
    var p = new URLSearchParams(location.search), g = function (k) { return (p.get(k) || '').slice(0, 80); };
    att = {
      referrer: document.referrer || '', source: g('utm_source'), medium: g('utm_medium'),
      campaign: g('utm_campaign') || g('c'), content: g('utm_content'), ref: (p.get('ref') || '').replace(/\D/g, '').slice(0, 6),
      landing: (location.pathname + location.search).slice(0, 200),
      q: { gclid: g('gclid'), ttclid: g('ttclid'), fbclid: g('fbclid') }
    };
    ss(AS, JSON.stringify(att));
  }

  function flush(sync) {
    if (!q.length || sending) return;
    var batch = q.splice(0, 20), body = JSON.stringify({ s: sid, a: att, e: batch });
    sending = true;
    try {
      if (sync && navigator.sendBeacon) navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }));
      else fetch('/api/e', { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    } catch (e) { /* a lost visit is not worth an error */ }
    sending = false;
  }

  // k: the kind, o: { p path, l label, v value in rupees }
  function track(k, o) {
    o = o || {};
    q.push({ k: k, p: o.p || (location.pathname + location.search).slice(0, 200), l: o.l || '', v: o.v });
    if (o.now) flush(true);                       // a click that is about to leave the page
    else if (q.length >= 10) flush(false);
  }
  window.bgcTrack = track;

  track('view', { l: (document.title || '').slice(0, 120) });
  if (location.pathname.indexOf('/visit') === 0) track('visit_page', {});

  // The three ways a sale can start, counted where they actually happen.
  // `now` sends immediately, because the browser is about to leave for
  // WhatsApp or the dialler and a queued event would never arrive.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || !a.href) return;
    var h = a.href, where = (a.getAttribute('data-where') || a.closest('[data-where]') && a.closest('[data-where]').getAttribute('data-where') || '').slice(0, 60);
    if (/(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)/i.test(h)) track('wa_click', { l: where || 'link', now: true });
    else if (h.indexOf('tel:') === 0) track('call_click', { l: where || 'link', now: true });
    else if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(h)) track('directions', { l: where || 'map', now: true });
  }, true);

  addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  addEventListener('pagehide', function () { flush(true); });
})();
