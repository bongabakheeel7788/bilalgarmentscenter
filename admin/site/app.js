// P93 — admin.bilalgarments.center. Read, search, export. Nothing here writes:
// every call is a GET except logging in and out. The menu is painted from the
// permission keys the POS gave this user; a page the key does not open is not
// offered, and the server refuses it anyway.
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const rs = v => { if (v == null || v === '') return '—'; const n = Number(v); if (!Number.isFinite(n)) return esc(v); const neg = n < 0; const s = Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); return (neg ? '−' : '') + 'Rs ' + s; };
const n0 = v => Number(v || 0).toLocaleString('en-PK');
const dt = iso => { if (!iso) return '—'; const d = new Date(iso); if (Number.isNaN(d.getTime())) return esc(iso); return d.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const dd = ymd => { if (!ymd) return '—'; const d = new Date(String(ymd).slice(0, 10) + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }); };
const pct = v => v == null ? '' : (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(v) + '%';
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`;
const statusPill = s => pill(s, { POSTED: 'g', PAID: 'g', OPEN: 'b', CLOSED: '', VOID: 'r', UNPAID: 'a', PARTIAL: 'a', NEW: 'b', DELIVERED: 'g', CANCELLED: 'r', RTO: 'r' }[s] || '');

let me = null, asOf = null, toastT = null;
function toast(msg) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3500); }
// P96 — the last answer for each page is kept on the phone (sessionStorage,
// this tab only) and painted at once; the fresh answer replaces it when it
// lands. A slow network then shows yesterday's figures with "updating…"
// instead of five seconds of "Loading…".
let paintingFromCache = false;
const cacheKey = path => 'bgc_admin:' + path;
const cacheGet = path => { try { const v = sessionStorage.getItem(cacheKey(path)); return v ? JSON.parse(v) : null; } catch { return null; } };
const cachePut = (path, body) => { try { sessionStorage.setItem(cacheKey(path), JSON.stringify(body)); } catch { /* full or blocked — fine */ } };
const cacheClear = () => { try { Object.keys(sessionStorage).filter(k => k.startsWith('bgc_admin:')).forEach(k => sessionStorage.removeItem(k)); } catch { /* fine */ } };
async function api(path, opts = {}) {
  if (paintingFromCache) { const hit = cacheGet(path); if (hit) { if (hit.as_of) asOf = hit.as_of; return hit; } throw Object.assign(new Error('NOCACHE'), { body: {} }); }
  let r;
  try { r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts }); }
  catch (e) { throw Object.assign(new Error('NETWORK'), { body: { error: 'NETWORK', hint: 'Could not reach the portal — check the internet connection and try again.' } }); }
  const body = await r.json().catch(() => ({ error: 'BAD_ANSWER', hint: `The portal answered ${r.status} without a message — try again in a moment.` }));
  if (r.status === 401 && !path.startsWith('/api/auth/')) { me = null; loginPage('Your session has ended — log in again.'); throw Object.assign(new Error('UNAUTHENTICATED'), { body }); }
  if (!r.ok) throw Object.assign(new Error(body.error || 'ERROR'), { status: r.status, body });
  if (body.as_of) asOf = body.as_of;
  if ((!opts.method || opts.method === 'GET') && !path.startsWith('/api/auth/')) cachePut(path, body);
  return body;
}
const can = k => !!(me && me.perms && me.perms[k] === 'ALLOW');

// ── the pages this user may open ────────────────────────────────────────────
const PAGES = [
  ['today', 'Today', 'report.sales'], ['sales', 'Sales', 'report.sales'], ['bills', 'Bills', 'pos.history.all'], ['stock', 'Stock', 'report.stock'],
  ['products', 'Products', 'catalog.view'], ['customers', 'Udhaar', 'credit.view'], ['cash', 'Cash', 'cash.move'], ['staff', 'Staff', 'attendance.view_all'],
  ['commission', 'Commission', 'comm.view_all'], ['orders', 'Website', 'orders.view'], ['traffic', 'Traffic', 'report.sales'], ['logins', 'Logins', 'user.manage'],
];
const PERIODS = ['Today', 'Yesterday', 'Last 7 Days', 'Last Week', 'This Month', 'Last 30 Days', 'This Year', 'Last Year', 'Custom'];

// ── shell ───────────────────────────────────────────────────────────────────
function staleStrip() {
  if (!asOf) return '';
  const age = (Date.now() - Date.parse(asOf)) / 60000;
  const h = new Date().getUTCHours() + 5;          // Karachi hour
  const open = (h % 24) >= 10 && (h % 24) <= 23;
  if (age > 180) return `<div class="stale red">The shop has not sent anything since ${dt(asOf)} — the POS may be off or offline. The figures below are from then.</div>`;
  if (age > 30 && open) return `<div class="stale">Last update from the shop ${Math.round(age)} min ago (${dt(asOf)}). The POS pushes every 10 minutes while it is running.</div>`;
  return '';
}
let suppressLoading = false;      // P96: the second pass must not wipe the cached paint with "Loading…"
function shell(page, inner) {
  if (suppressLoading && inner.includes('Loading…')) return;
  const tabs = PAGES.filter(p => can(p[2])).map(p => `<a href="#/${p[0]}" class="${p[0] === page ? 'on' : ''}">${p[1]}</a>`).join('');
  app.innerHTML = `<div class="top"><div class="row"><span class="brand">BGC <b>admin</b></span>
      <span class="who"><span class="asof" title="when the shop last pushed">${paintingFromCache ? '<span class="upd">updating…</span> ' : ''}as of ${dt(asOf)}</span><span class="nm">${esc(me.user.name)}</span><button class="btn sm" id="logout">Log out</button></span></div>
      <nav class="tabs">${tabs}</nav></div>${staleStrip()}<main class="page">${inner}</main>`;
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; cacheClear(); location.hash = ''; route(); };
}
const loading = title => `<h1 class="pt">${esc(title)}</h1><div class="card"><p class="mut">Loading…</p></div>`;
const errCard = e => `<div class="card"><div class="err">${esc(e.body && e.body.hint || e.body && e.body.error || e.message)}</div></div>`;

// tables: columns [{k, t, num, f}] — f formats; csv export from the same rows
function table(rows, cols, { id, empty = 'Nothing here.', total, link } = {}) {
  if (!rows || !rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const cell = (r, c) => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(r[c.k], r) : esc(r[c.k] ?? '—')}</td>`;
  const body = rows.map(r => `<tr ${link ? `class="link" data-go="${esc(link(r))}"` : ''}>${cols.map(c => cell(r, c)).join('')}</tr>`).join('');
  const tot = total ? `<tr class="tot">${cols.map(c => `<td class="${c.num ? 'num' : ''}">${total[c.k] != null ? (c.f ? c.f(total[c.k], total) : esc(total[c.k])) : ''}</td>`).join('')}</tr>` : '';
  return `<div class="tw"><table ${id ? `id="${id}"` : ''}><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${body}${tot}</tbody></table></div>`;
}
const csvBtn = (name, rows, cols) => { const k = 'csv' + Math.random().toString(36).slice(2, 7); CSV[k] = { name, rows, cols }; return `<button class="btn sm" data-csv="${k}">CSV</button>`; };
const CSV = {};
function downloadCsv({ name, rows, cols }) {
  const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const text = [cols.map(c => q(c.t)).join(',')].concat(rows.map(r => cols.map(c => q(r[c.k])).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = `${name}.csv`; a.click();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-csv]'); if (b) { downloadCsv(CSV[b.dataset.csv]); return; }
  const tr = e.target.closest('tr[data-go]'); if (tr) location.hash = tr.dataset.go;
});

// period picker (Sales, Commission)
function periodBar(q, onChange) {
  const chips = PERIODS.filter(p => p !== 'Custom').map(p => `<button class="${q.period === p ? 'on' : ''}" data-p="${p}">${p}</button>`).join('');
  const custom = `<div class="bar"><input type="date" id="pFrom" value="${esc(q.from || '')}"><input type="date" id="pTo" value="${esc(q.to || '')}"><button class="btn sm" id="pGo">Custom range</button></div>`;
  setTimeout(() => {
    document.querySelectorAll('.chips [data-p]').forEach(b => b.onclick = () => onChange({ period: b.dataset.p }));
    const go = $('#pGo'); if (go) go.onclick = () => { const f = $('#pFrom').value, t = $('#pTo').value; if (f && t) onChange({ period: 'Custom', from: f, to: t }); };
  });
  return `<div class="chips">${chips}</div>${custom}`;
}
const qs = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const windowText = w => w.from === w.to ? dd(w.from) : `${dd(w.from)} – ${dd(w.to)}`;
const tile = (k, v, d = '', kind = '') => `<div class="tile ${kind}"><div class="k">${esc(k)}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const chg = (v, label = 'vs before') => v == null ? '' : ` · <span class="${cls(v)}">${pct(v)}</span> ${label}`;
function barChart(points, key, labelOf) {
  const max = Math.max(1, ...points.map(p => Number(p[key]) || 0));
  return `<div class="chart">${points.map(p => `<div class="b" style="height:${Math.max(1.5, Number(p[key]) / max * 100)}%"><span>${esc(labelOf(p))}: ${rs(p[key])}${p.bills != null ? ` · ${p.bills} bill${p.bills === 1 ? '' : 's'}` : ''}</span></div>`).join('')}</div>
    <div class="axis"><span>${esc(labelOf(points[0]))}</span><span>${esc(labelOf(points[points.length - 1]))}</span></div>`;
}

// ── login ───────────────────────────────────────────────────────────────────
function loginPage(msg = '') {
  app.innerHTML = `<main class="login"><form class="card" id="lf"><h1>Bilal Garments Center</h1><p class="mut">The admin portal. Your POS username and password.</p>
    <label for="u">Username</label><input id="u" name="username" autocomplete="username" autocapitalize="none" required>
    <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
    <div style="margin-top:14px"><button class="btn primary" style="width:100%">Log in</button></div>
    ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <p class="xs mut" style="margin:14px 0 0">Read-only. Nothing you do here changes anything in the shop.</p></form></main>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const b = $('#lf button'); b.disabled = true; b.textContent = 'Checking…';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#u').value, password: $('#p').value }) });
      me = r; route();
    } catch (err) { loginPage(err.body && err.body.hint || `Could not log in (${err.message}).`); $('#u').value = $('#u') ? $('#u').value : ''; }
  };
}

// ── pages ───────────────────────────────────────────────────────────────────
const pages = {
  async today() {
    shell('today', loading('Today'));
    const d = await api('/api/today');
    const s = d.sales;
    const tiles = [
      tile('Sales', rs(s.net), `${n0(s.bills)} bills · ${n0(s.units)} pcs${chg(s.change && s.change.net, 'vs yesterday')}`),
      s.profit !== undefined ? tile('Profit', rs(s.profit), `${s.margin_pct}% margin${chg(s.change && s.change.profit, 'vs yesterday')}`) : '',
      d.cash ? tile('Cash in drawer (expected)', rs(d.cash.expected_now), `cash sales ${rs(d.cash.cash_sales)} · expenses ${rs(d.cash.drawer_expenses)}`) : '',
      d.receivables ? tile('Udhaar out', rs(d.receivables.total), `${n0(d.receivables.customers)} customer${d.receivables.customers === 1 ? '' : 's'} · ${rs(d.receivables.overdue_60)} over 60 days`, Number(d.receivables.overdue_60) > 0 ? 'warn' : '') : '',
      tile('Returns', rs(s.refunds), `expenses ${rs(s.expenses)}${Number(s.bad_debt) ? ` · bad debt ${rs(s.bad_debt)}` : ''}`),
      tile('Average bill', rs(s.average_basket), `${n0(s.bills)} bills today`),
      d.stock ? tile('Stock', `${n0(d.stock.pieces)} pcs`, `${d.stock.value_at_cost !== undefined ? 'at cost ' + rs(d.stock.value_at_cost) : 'at retail ' + rs(d.stock.value_at_retail)} · ${n0(d.stock.low_count)} low${d.stock.below_zero_count ? ` · <b class="neg">${d.stock.below_zero_count} below zero</b>` : ''}`, d.stock.below_zero_count ? 'warn' : '') : '',
      d.shift ? tile('Shift', d.shift.days_open ? `${d.shift.days_open} day${d.shift.days_open === 1 ? '' : 's'} open` : 'Open', `since ${dd(d.shift.opened_on)} · ${esc(d.shift.by || '')} · float ${rs(d.shift.opening_float)}`, d.shift.days_open > 0 ? 'warn' : '') : tile('Shift', 'Closed', 'no shift open at the till'),
    ].join('');
    const attention = d.orders && d.orders.attention.length ? `<div class="card"><h2>Needs a call</h2><ul style="margin:0;padding-left:18px">${d.orders.attention.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
    const hourRange = d.hours.length ? Array.from({ length: Math.max(23, ...d.hours.map(h => h.hour)) - Math.min(9, ...d.hours.map(h => h.hour)) + 1 }, (_, i) => Math.min(9, ...d.hours.map(h => h.hour)) + i) : [];
    const hoursFilled = hourRange.map(h => d.hours.find(x => x.hour === h) || { hour: h, bills: 0, net: '0' });
    const hours = d.hours.length ? `<div class="card"><h2>By hour</h2>${barChart(hoursFilled, 'net', p => `${p.hour}:00`)}</div>` : '';
    const methods = `<div class="card"><h2>How the money came in</h2>${table(d.methods, [{ k: 'method', t: 'Method' }, { k: 'bills', t: 'Bills', num: true }, { k: 'amount', t: 'Amount', num: true, f: rs }], { empty: 'No bills yet today.' })}</div>`;
    const staff = `<div class="card"><h2>Salesmen</h2>${table(d.staff, [{ k: 'name', t: 'Name' }, { k: 'bills', t: 'Bills', num: true }, { k: 'units', t: 'Pcs', num: true }, { k: 'net', t: 'Sales', num: true, f: rs }, { k: 'abv', t: 'Avg bill', num: true, f: rs }], { empty: 'No sales yet today.' })}</div>`;
    const devices = (d.new_devices || []).length ? `<div class="card notice"><b>New device.</b> ${d.new_devices.map(x => `<b>${esc(x.username)}</b> logged in from a device that username had not used before, at ${dt(x.at)}`).join('; ')}. Not you? Change that password on the POS — the portal follows at the next push.</div>` : '';
    shell('today', `<h1 class="pt">Today <small>${dd(d.today)}</small></h1>${devices}<div class="tiles">${tiles}</div>${attention}<div class="cols">${methods}${staff}</div>${hours}`);
  },

  async sales(q) {
    q = { period: q.period || 'Today', from: q.from, to: q.to };
    shell('sales', loading('Sales'));
    const go = nq => { location.hash = '#/sales?' + qs(nq); };
    let d; try { d = await api('/api/sales?' + qs(q)); } catch (e) { shell('sales', `<h1 class="pt">Sales</h1>${periodBar(q, go)}${errCard(e)}`); return; }
    const s = d.summary;
    const tiles = [
      tile('Net sales', rs(s.net), `${n0(s.bills)} bills · ${n0(s.units)} pcs${chg(s.change.net)}`),
      s.profit !== undefined ? tile('Profit', rs(s.profit), `${s.margin_pct}% margin · cost ${rs(s.cost)}${chg(s.change.profit)}`) : tile('Average bill', rs(s.average_basket), `${s.upt} pcs per bill`),
      tile('Discounts', rs(s.discount), `gross ${rs(s.gross)} · round-off ${rs(s.round_off)}`),
      tile('Returns', rs(s.refunds), `refunded in the period`),
    ].join('');
    const series = d.series.points.length ? `<div class="card"><h2>${d.series.by === 'hour' ? 'By hour' : 'By day'}<span class="tools">${csvBtn('sales-series', d.series.points, [{ k: 'k', t: d.series.by }, { k: 'net', t: 'Net' }, { k: 'bills', t: 'Bills' }, ...(s.profit !== undefined ? [{ k: 'profit', t: 'Profit' }] : [])])}</span></h2>${barChart(d.series.points, 'net', p => d.series.by === 'hour' ? `${p.k}:00` : dd(p.k))}</div>` : '';
    const moneyCols = [{ k: 'units', t: 'Pcs', num: true }, { k: 'net', t: 'Net', num: true, f: rs }, ...(s.profit !== undefined ? [{ k: 'profit', t: 'Profit', num: true, f: rs }] : [])];
    const catCols = [{ k: 'label', t: 'Category' }, ...moneyCols];
    const itemCols = [{ k: 'style', t: 'Product' }, { k: 'size', t: 'Size' }, { k: 'colour', t: 'Colour' }, ...moneyCols];
    const staffCols = [{ k: 'name', t: 'Salesman' }, { k: 'bills', t: 'Bills', num: true }, { k: 'units', t: 'Pcs', num: true }, { k: 'net', t: 'Sales', num: true, f: rs }, { k: 'upt', t: 'Pcs/bill', num: true }, { k: 'abv', t: 'Avg bill', num: true, f: rs }];
    const methCols = [{ k: 'method', t: 'Method' }, { k: 'bills', t: 'Bills', num: true }, { k: 'amount', t: 'Amount', num: true, f: rs }];
    const card = (t, name, rows, cols, empty) => `<div class="card"><h2>${t}<span class="tools">${csvBtn(name, rows, cols)}</span></h2>${table(rows, cols, { empty })}</div>`;
    shell('sales', `<h1 class="pt">Sales <small>${windowText(s)}${s.before ? ` · before: ${windowText(s.before)} ${rs(s.before.net)}` : ''}</small></h1>${periodBar(q, go)}
      <div class="tiles">${tiles}</div>${series}
      <div class="cols">${card('By category', 'sales-by-category', d.categories, catCols, 'Nothing sold.')}${card('How the money came in', 'sales-by-method', d.methods, methCols, 'No bills.')}</div>
      ${card('Salesmen', 'sales-by-salesman', d.staff, staffCols, 'No sales.')}${card('Top items', 'sales-items', d.items, itemCols, 'Nothing sold.')}`);
  },

  async bills(q) {
    shell('bills', loading('Bills'));
    const d = await api('/api/bills?' + qs({ q: q.q, from: q.from, to: q.to, page: q.page }));
    const cols = [{ k: 'invoice_no', t: 'Bill', f: (v, r) => `<b>${esc(v)}</b><div class="xs mut">${dt(r.created_at)}</div>` }, { k: 'customer', t: 'Customer', f: (v, r) => `${esc(v || (r.phone ? '' : '—'))}<div class="xs mut">${esc(r.phone || '')}</div>` },
      { k: 'salesman', t: 'Salesman' }, { k: 'units', t: 'Pcs', num: true }, { k: 'total', t: 'Total', num: true, f: rs }, { k: 'balance_due', t: 'Due', num: true, f: (v, r) => Number(v) > 0 ? `<span class="neg">${rs(v)}</span>` : '' },
      { k: 'status', t: 'Status', f: (v, r) => statusPill(v === 'POSTED' ? r.payment_status : v) }];
    const pages = Math.ceil(d.total / d.page_size);
    const pager = pages > 1 ? `<div class="bar"><span class="mut sm">${n0(d.total)} bills · page ${d.page + 1} of ${pages}</span>${d.page > 0 ? `<a class="btn sm" href="#/bills?${qs({ ...q, page: d.page - 1 })}">‹ Newer</a>` : ''}${d.page + 1 < pages ? `<a class="btn sm" href="#/bills?${qs({ ...q, page: d.page + 1 })}">Older ›</a>` : ''}</div>` : `<div class="mut sm" style="margin-bottom:8px">${n0(d.total)} bills</div>`;
    shell('bills', `<h1 class="pt">Bills <small>${d.q ? `matching “${esc(d.q)}”` : `${dd(d.from)} – ${dd(d.to)}`}</small></h1>
      <form class="bar" id="bf"><input class="grow" id="bq" placeholder="Bill number, phone, customer or amount" value="${esc(d.q)}"><input type="date" id="bFrom" value="${esc(d.from)}"><input type="date" id="bTo" value="${esc(d.to)}"><button class="btn primary sm">Search</button></form>
      ${pager}<div class="card">${table(d.rows, cols, { empty: 'No bills match.', link: r => `#/bill/${r.id}` })}</div>`);
    $('#bf').onsubmit = e => { e.preventDefault(); location.hash = '#/bills?' + qs({ q: $('#bq').value.trim(), from: $('#bFrom').value, to: $('#bTo').value }); };
  },

  async bill(q, id) {
    shell('bills', loading('Bill'));
    const d = await api('/api/bills/' + encodeURIComponent(id));
    const b = d.bill, seeCost = d.lines.some(l => l.cost_at_sale !== undefined);
    const lineCols = [{ k: 'style', t: 'Item', f: (v, r) => `${esc(v)}<div class="xs mut">${[r.size, r.colour, r.sku].filter(Boolean).map(esc).join(' · ')}</div>` }, { k: 'qty', t: 'Qty', num: true }, { k: 'unit_price', t: 'Price', num: true, f: rs },
      { k: 'line_discount', t: 'Disc.', num: true, f: (v, r) => { const t = Number(v || 0) + Number(r.bill_discount_share || 0); return t ? rs(t) : ''; } }, { k: 'line_total', t: 'Total', num: true, f: rs },
      ...(seeCost ? [{ k: 'cost_at_sale', t: 'Cost', num: true, f: (v, r) => rs(Number(v) * r.qty) }] : []), { k: 'returned_qty', t: 'Ret.', num: true, f: v => Number(v) ? `<span class="neg">${v}</span>` : '' }];
    const kv = [['Date', `${dd(b.business_date)} · ${dt(b.created_at)}`], ['Customer', `${esc(b.customer || '—')}${b.phone ? ` · ${esc(b.phone)}` : ''}`], ['Salesman', esc(b.salesman || '—')], ['Cashier', esc(b.cashier || '—')], ['Channel', esc(b.channel || 'SHOP')],
      ['Subtotal', rs(b.subtotal)], ['Discount', `${rs(b.discount)}${b.discount_reason ? ` <span class="mut">(${esc(b.discount_reason)})</span>` : ''}`], ['Round-off', rs(b.round_off)], ['<b>Total</b>', `<b>${rs(b.total)}</b>`], ['Paid', rs(b.amount_paid)], ['Balance due', Number(b.balance_due) > 0 ? `<span class="neg">${rs(b.balance_due)}</span>` : rs(0)]];
    if (b.status === 'VOID') kv.push(['Voided', `${dt(b.voided_at)} — ${esc(b.void_reason || '')}`]);
    if (b.notes) kv.push(['Notes', esc(b.notes)]);
    shell('bills', `<a class="back" href="#/bills">‹ Bills</a><h1 class="pt">${esc(b.invoice_no)} ${statusPill(b.status === 'POSTED' ? b.payment_status : b.status)}${b.is_practice ? pill('PRACTICE', 'a') : ''}</h1>
      <div class="cols"><div class="card"><h2>The bill</h2><div class="kv">${kv.map(([k, v]) => `<span>${k}</span><span class="num">${v}</span>`).join('')}</div></div>
      <div class="card"><h2>Payments</h2>${table(d.payments, [{ k: 'method', t: 'Method' }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'reference', t: 'Ref.' }, { k: 'at', t: 'When', f: dt }], { empty: 'No payment — udhaar.' })}
      ${d.returns.length ? `<h2 style="margin-top:14px">Returns against it</h2>${table(d.returns, [{ k: 'return_no', t: 'Return' }, { k: 'type', t: 'Type' }, { k: 'business_date', t: 'Date', f: dd }, { k: 'refund_amount', t: 'Refund', num: true, f: rs }, { k: 'refund_method', t: 'How' }, { k: 'status', t: 'Status', f: statusPill }])}` : ''}</div></div>
      <div class="card"><h2>Lines</h2>${table(d.lines, lineCols)}</div>`);
  },

  async stock() {
    shell('stock', loading('Stock'));
    const d = await api('/api/stock');
    const v = d.value;
    const tiles = [tile('Pieces on the shelf', n0(v.pieces), `${n0(v.damaged)} damaged`), v.at_cost !== undefined ? tile('Value at cost', rs(v.at_cost), `at retail ${rs(v.at_retail)}`) : tile('Value at retail', rs(v.at_retail)),
      tile('Low', n0(d.lists.low.length), 'sizes at or under the low line', d.lists.low.length ? 'warn' : ''), tile('Below zero', n0(d.lists.below_zero.length), 'counts that need fixing', d.lists.below_zero.length ? 'bad' : ''),
      v.retired.pieces ? tile('Retired stock', `${n0(v.retired.pieces)} pcs`, `on ${v.retired.lines} inactive sizes${v.retired.at_cost !== undefined ? ` · ${rs(v.retired.at_cost)} at cost` : ''} — the till cannot sell these`, 'warn') : ''].join('');
    const cols = [{ k: 'style', t: 'Product', f: (x, r) => `${esc(x)}<div class="xs mut">${esc(r.code || '')}</div>` }, { k: 'size', t: 'Size' }, { k: 'colour', t: 'Colour' }, { k: 'qty', t: 'Qty', num: true, f: x => Number(x) < 0 ? `<b class="neg">${x}</b>` : x }];
    const catCols = [{ k: 'label', t: 'Category' }, { k: 'styles', t: 'Products', num: true }, { k: 'pieces', t: 'Pcs', num: true }, ...(v.at_cost !== undefined ? [{ k: 'at_cost', t: 'At cost', num: true, f: rs }] : []), { k: 'at_retail', t: 'At retail', num: true, f: rs }];
    const card = (t, name, rows, c, empty) => `<div class="card"><h2>${t}<span class="tools">${csvBtn(name, rows, c)}</span></h2>${table(rows, c, { empty })}</div>`;
    shell('stock', `<h1 class="pt">Stock</h1><div class="tiles">${tiles}</div>
      ${d.lists.below_zero.length ? card('Below zero — sold what the count said was not there', 'stock-below-zero', d.lists.below_zero, cols) : ''}
      <div class="cols">${card('Low stock', 'stock-low', d.lists.low, cols, 'Nothing is low.')}${card('By category', 'stock-by-category', d.categories, catCols)}</div>
      ${card('Out of stock (active sizes at zero)', 'stock-out', d.lists.out, cols, 'Nothing is out.')}`);
  },

  async products(q) {
    shell('products', loading('Products'));
    const d = await api('/api/products?' + qs({ q: q.q, page: q.page, status: q.status }));
    const seeCost = d.rows.some(r => r.purchase_price !== undefined);
    const cols = [{ k: 'name', t: 'Product', f: (v, r) => `<b>${esc(v)}</b><div class="xs mut">${esc(r.code)} · ${esc(r.category || '')}</div>` }, { k: 'sizes', t: 'Sizes', num: true }, { k: 'on_hand', t: 'On hand', num: true },
      ...(seeCost ? [{ k: 'purchase_price', t: 'Cost', num: true, f: rs }] : []), { k: 'selling_price', t: 'Price', num: true, f: rs }, { k: 'status', t: '', f: (v, r) => (v !== 'ACTIVE' ? pill(v, 'a') : '') + (r.show_online ? pill('online', 'b') : '') }];
    const pages = Math.ceil(d.total / d.page_size);
    const pager = pages > 1 ? `<div class="bar"><span class="mut sm">${n0(d.total)} products · page ${d.page + 1} of ${pages}</span>${d.page > 0 ? `<a class="btn sm" href="#/products?${qs({ ...q, page: d.page - 1 })}">‹</a>` : ''}${d.page + 1 < pages ? `<a class="btn sm" href="#/products?${qs({ ...q, page: d.page + 1 })}">›</a>` : ''}</div>` : `<div class="mut sm" style="margin-bottom:8px">${n0(d.total)} products</div>`;
    shell('products', `<h1 class="pt">Products</h1><form class="bar" id="pf"><input class="grow" id="pq" placeholder="Name, code, barcode or category" value="${esc(d.q)}"><button class="btn primary sm">Search</button></form>
      ${pager}<div class="card">${table(d.rows, cols, { empty: 'No product matches.', link: r => `#/product/${r.id}` })}</div>`);
    $('#pf').onsubmit = e => { e.preventDefault(); location.hash = '#/products?' + qs({ q: $('#pq').value.trim() }); };
  },

  async product(q, id) {
    shell('products', loading('Product'));
    const d = await api('/api/products/' + encodeURIComponent(id));
    const s = d.style, seeCost = s.purchase_price !== undefined;
    const cols = [{ k: 'colour', t: 'Colour' }, { k: 'size', t: 'Size' }, { k: 'barcode', t: 'Tag', f: v => `<span class="mono">${esc(v || '')}</span>` }, { k: 'qty', t: 'Qty', num: true, f: (v, r) => `${Number(v) < 0 ? `<b class="neg">${v}</b>` : v}${r.damaged ? `<div class="xs neg">${r.damaged} damaged</div>` : ''}` },
      ...(seeCost ? [{ k: 'purchase_price', t: 'Cost', num: true, f: (v, r) => `${rs(v)}${r.own_cost ? '<div class="xs mut">own</div>' : ''}` }] : []), { k: 'selling_price', t: 'Price', num: true, f: (v, r) => `${rs(v)}${r.own_price ? '<div class="xs mut">own</div>' : ''}` }, { k: 'status', t: '', f: v => v !== 'ACTIVE' ? pill(v, 'a') : '' }];
    const kv = [['Code', esc(s.code)], ['Category', esc(s.category || '—')], ['Size group', esc(s.size_group || '—')], ['Supplier', esc(s.supplier || '—')], ...(seeCost ? [['Default cost', rs(s.purchase_price)]] : []), ['Default price', rs(s.selling_price)], ['Website', s.show_online ? 'on' : 'off'], ['On hand', n0(d.variants.reduce((a, v) => a + Math.max(0, v.qty), 0)) + ' pcs'], ['Updated', dt(s.updated_at)]];
    shell('products', `<a class="back" href="#/products">‹ Products</a><h1 class="pt">${esc(s.name)} ${s.status !== 'ACTIVE' ? pill(s.status, 'a') : ''}</h1>
      <div class="card"><div class="kv">${kv.map(([k, v]) => `<span>${k}</span><span class="num">${v}</span>`).join('')}</div>${s.notes ? `<p class="sm mut" style="margin:10px 0 0">${esc(s.notes)}</p>` : ''}</div>
      <div class="card"><h2>Sizes and colours<span class="tools">${csvBtn(`product-${s.code}`, d.variants, cols)}</span></h2>${table(d.variants, cols)}</div>`);
  },

  async customers() {
    shell('customers', loading('Udhaar'));
    const d = await api('/api/customers');
    const o = d.owed, r = d.receivables;
    const tiles = [tile('Udhaar out', rs(o.total), `${n0(o.customers)} customers`), tile('Over 60 days', rs(o.overdue_60), `oldest ${o.oldest_days} days`, Number(o.overdue_60) > 0 ? 'warn' : ''), tile('Lapsed', rs(d.lapsed.total), `${d.lapsed.rows.length} nobody has paid in ${d.lapsed.after_days} days`, d.lapsed.rows.length ? 'bad' : '')].join('');
    const cust = (v, x) => `${esc(v)}${x.phone ? `<div class="xs mut">${esc(x.phone)}</div>` : ''}`;
    const recCols = [{ k: 'customer', t: 'Customer', f: cust }, { k: 'bills', t: 'Bills', num: true }, { k: 'd0_30', t: '0–30', num: true, f: rs }, { k: 'd31_60', t: '31–60', num: true, f: rs }, { k: 'd61_90', t: '61–90', num: true, f: rs }, { k: 'd90_plus', t: '90+', num: true, f: rs }, { k: 'total', t: 'Total', num: true, f: rs }];
    const lapCols = [{ k: 'customer', t: 'Customer', f: cust }, { k: 'balance', t: 'Balance', num: true, f: rs }, { k: 'oldest_days', t: 'Oldest', num: true, f: v => `${v} d` }, { k: 'last_paid', t: 'Last paid', f: v => v ? dd(v) : 'never' }, { k: 'days_since_payment', t: 'Since', num: true, f: v => `${v} d` }];
    const colCols = [{ k: 'business_date', t: 'Date', f: dd }, { k: 'collection_no', t: 'No.' }, { k: 'customer', t: 'Customer', f: cust }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'method', t: 'How' }, { k: 'received_by', t: 'By' }, { k: 'status', t: '', f: v => v !== 'POSTED' ? pill(v, 'r') : '' }];
    const woCols = [{ k: 'at', t: 'When', f: dt }, { k: 'customer', t: 'Customer' }, { k: 'invoice_no', t: 'Bill' }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'kind', t: 'Kind' }, { k: 'reason', t: 'Reason' }, { k: 'approved_by', t: 'Approved by' }];
    const card = (t, name, rows, c, opts) => `<div class="card"><h2>${t}<span class="tools">${csvBtn(name, rows, c)}</span></h2>${table(rows, c, opts)}</div>`;
    shell('customers', `<h1 class="pt">Udhaar <small>as on ${dd(d.as_on)}</small></h1><div class="tiles">${tiles}</div>
      ${d.lapsed.rows.length ? card('Lapsed — nobody has paid', 'udhaar-lapsed', d.lapsed.rows, lapCols) : ''}
      ${card('Who owes what', 'udhaar-receivables', r.rows, recCols, { empty: 'Nobody owes anything.', total: { customer: 'Total', ...r.totals } })}
      <div class="cols">${card('Recent collections', 'udhaar-collections', d.collections, colCols, { empty: 'None yet.' })}${card('Write-offs', 'udhaar-writeoffs', d.writeoffs, woCols, { empty: 'None.' })}</div>`);
  },

  async cash(q) {
    shell('cash', loading('Cash'));
    const d = await api('/api/cash?' + qs({ date: q.date }));
    const y = d.day;
    const lines = [['Opening float', y.opening_float], ['+ Cash sales', y.cash_sales], ['− Cash refunds', y.cash_refunds], ['− Expenses from the drawer', y.drawer_expenses], ['− Commission paid', y.commission_paid], ['+ Udhaar collected', y.collections], ['+ Advances taken', y.advances],
      ['− Staff advances', y.staff_advances], ['− Salaries', y.salaries_paid], ['− Supplier payments', y.supplier_payments], ['− To the bank', y.bank_deposits], ['− Owner\'s drawings', y.drawings], ['± Other', y.other_net]].filter(([k, v]) => Number(v) !== 0 || /Opening|Cash sales/.test(k));
    const sheet = `<div class="kv">${lines.map(([k, v]) => `<span>${k}</span><span class="num">${rs(v)}</span>`).join('')}<span><b>= Expected in the drawer</b></span><span class="num"><b>${rs(y.expected)}</b></span></div>
      ${y.by_method.length ? `<p class="sm mut" style="margin:10px 0 0">Sales by method: ${y.by_method.map(m => `${esc(m.method)} ${rs(m.amount)}`).join(' · ')}</p>` : ''}`;
    const shiftCols = [{ k: 'business_date', t: 'Day', f: dd }, { k: 'by', t: 'Opened by' }, { k: 'opened_at', t: 'Opened', f: dt }, { k: 'closed_at', t: 'Closed', f: v => v ? dt(v) : '<span class="pill b">open</span>' }, { k: 'opening_float', t: 'Float', num: true, f: rs }, { k: 'expected_cash', t: 'Expected', num: true, f: v => v == null ? '' : rs(v) }, { k: 'declared_cash', t: 'Counted', num: true, f: v => v == null ? '' : rs(v) }, { k: 'variance', t: 'Variance', num: true, f: (v, r) => v == null ? (r.variance_reason === 'not counted' || r.variance_reason === 'not a real count' ? pill('not counted') : '') : `<span class="${cls(Number(v))}">${rs(v)}</span>` }];
    const closeCols = [{ k: 'business_date', t: 'Day', f: (v, r) => `${dd(v)}${r.days > 1 ? `<div class="xs mut">${r.days} days in one close</div>` : ''}${r.closed_with ? `<div class="xs mut">closed with ${dd(r.closed_with)}</div>` : ''}` }, { k: 'by', t: 'By' }, { k: 'locked_at', t: 'At', f: dt }, { k: 'expected', t: 'Expected', num: true, f: v => v == null ? '' : rs(v) }, { k: 'declared', t: 'Counted', num: true, f: v => v == null ? '' : rs(v) }, { k: 'variance', t: 'Variance', num: true, f: (v, r) => r.not_counted ? pill('not counted') : v == null ? '' : `<span class="${cls(Number(v))}">${rs(v)}</span>` }, { k: 'reopened_at', t: '', f: (v, r) => (v ? pill('reopened', 'a') : '') + (r.auto_closed ? pill('auto', '') : '') }];
    const movCols = [{ k: 'at', t: 'When', f: dt }, { k: 'ref_type', t: 'What', f: v => pill(v) }, { k: 'direction', t: '', f: v => v === 'IN' ? '<span class="pos">in</span>' : '<span class="neg">out</span>' }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'reason', t: 'Reason' }, { k: 'by', t: 'By' }];
    const expCols = [{ k: 'at', t: 'When', f: dt }, { k: 'category', t: 'Category' }, { k: 'description', t: 'What' }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'method', t: 'How', f: (v, r) => `${esc(v)}${r.paid_from_drawer ? ' <span class="xs mut">drawer</span>' : ''}` }, { k: 'by', t: 'By' }, { k: 'status', t: '', f: v => v !== 'POSTED' ? pill(v, 'r') : '' }];
    shell('cash', `<h1 class="pt">Cash <small>${dd(d.date)}${d.date === d.today ? ' · today' : ''}</small></h1>
      <form class="bar" id="cf"><input type="date" id="cd" value="${esc(d.date)}"><button class="btn sm">Show that day</button></form>
      <div class="cols"><div class="card"><h2>The cash sheet</h2>${sheet}</div><div class="card"><h2>Shifts (last two weeks)</h2>${table(d.shifts, shiftCols, { empty: 'No shifts.' })}</div></div>
      <div class="card"><h2>Day closes<span class="tools">${csvBtn('day-closes', d.closes, closeCols)}</span></h2>${table(d.closes, closeCols, { empty: 'No day has been closed yet.' })}</div>
      <div class="cols"><div class="card"><h2>Drawer movements</h2>${table(d.movements, movCols, { empty: 'Nothing moved.' })}</div><div class="card"><h2>Expenses</h2>${table(d.expenses, expCols, { empty: 'No expenses.' })}</div></div>`);
    $('#cf').onsubmit = e => { e.preventDefault(); location.hash = '#/cash?' + qs({ date: $('#cd').value }); };
  },

  async staff(q) {
    shell('staff', loading('Staff'));
    const d = await api('/api/staff?' + qs({ month: q.month }));
    const pCols = [{ k: 'name', t: 'Name', f: (v, r) => `${esc(v)}<div class="xs mut">${esc(r.role)}${r.status !== 'ACTIVE' ? ' · ' + esc(r.status) : ''}</div>` }, { k: 'days', t: 'Days', num: true }, { k: 'hours', t: 'Hours', num: true }, { k: 'last_in', t: 'Last in', f: dt }];
    const aCols = [{ k: 'business_date', t: 'Day', f: dd }, { k: 'name', t: 'Name' }, { k: 'punch_in', t: 'In', f: v => v ? dt(v).slice(-5) : '' }, { k: 'punch_out', t: 'Out', f: v => v ? dt(v).slice(-5) : '<span class="pill b">in</span>' }, { k: 'break_minutes', t: 'Break', num: true, f: v => v ? `${v} min` : '' }, { k: 'hours', t: 'Hours', num: true }, { k: 'source', t: '', f: v => v && v !== 'PUNCH' ? pill(v) : '' }];
    const advCols = [{ k: 'advance_date', t: 'Date', f: dd }, { k: 'name', t: 'Name' }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'note', t: 'Note' }, { k: 'settled', t: '', f: (v, r) => v ? pill('settled ' + dd(r.settled_at), 'g') : pill('open', 'a') }];
    const salCols = [{ k: 'period_month', t: 'Month', f: v => String(v).slice(0, 7) }, { k: 'name', t: 'Name' }, { k: 'gross', t: 'Gross', num: true, f: rs }, { k: 'advances_deducted', t: 'Advances', num: true, f: rs }, { k: 'absence_deduction', t: 'Absence', num: true, f: rs }, { k: 'net', t: 'Net', num: true, f: rs }, { k: 'paid_at', t: 'Paid', f: v => v ? dt(v) : pill('unpaid', 'a') }];
    shell('staff', `<h1 class="pt">Staff <small>${esc(d.month)}</small></h1><form class="bar" id="sf"><input type="month" id="sm" value="${esc(d.month)}"><button class="btn sm">Show</button></form>
      <div class="cols"><div class="card"><h2>Attendance this month<span class="tools">${csvBtn('staff-month', d.people, pCols)}</span></h2>${table(d.people, pCols)}</div>
      ${d.advances ? `<div class="card"><h2>Advances</h2>${table(d.advances, advCols, { empty: 'None.' })}</div>` : ''}</div>
      ${d.salaries ? `<div class="card"><h2>Salaries<span class="tools">${csvBtn('salaries', d.salaries, salCols)}</span></h2>${table(d.salaries, salCols, { empty: 'None yet.' })}</div>` : ''}
      <div class="card"><h2>Punches<span class="tools">${csvBtn('attendance', d.attendance, aCols)}</span></h2>${table(d.attendance, aCols, { empty: 'No punches this month.' })}</div>`);
    $('#sf').onsubmit = e => { e.preventDefault(); location.hash = '#/staff?' + qs({ month: $('#sm').value }); };
  },

  async commission(q) {
    q = { period: q.period || 'This Month', from: q.from, to: q.to };
    shell('commission', loading('Commission'));
    const go = nq => { location.hash = '#/commission?' + qs(nq); };
    let d; try { d = await api('/api/commission?' + qs(q)); } catch (e) { shell('commission', `<h1 class="pt">Commission</h1>${periodBar(q, go)}${errCard(e)}`); return; }
    const cols = [{ k: 'name', t: 'Salesman' }, { k: 'earned', t: 'Earned in period', num: true, f: rs }, { k: 'held', t: 'Held', num: true, f: v => Number(v) ? `<span class="neg">${rs(v)}</span>` : '' }, { k: 'unsettled', t: 'Owed now (all time)', num: true, f: rs }];
    const sCols = [{ k: 'business_date', t: 'Date', f: dd }, { k: 'name', t: 'Salesman' }, { k: 'direction', t: '', f: v => v === 'PAID_OUT' ? '<span class="neg">paid out</span>' : '<span class="pos">recovered</span>' }, { k: 'amount', t: 'Amount', num: true, f: rs }, { k: 'note', t: 'Note' }, { k: 'by', t: 'By' }];
    shell('commission', `<h1 class="pt">Commission <small>${windowText(d)}</small></h1>${periodBar(q, go)}
      <div class="card"><h2>Per salesman<span class="tools">${csvBtn('commission', d.rows, cols)}</span></h2>${table(d.rows, cols, { empty: 'No commission in this period.' })}</div>
      <div class="card"><h2>Settlements</h2>${table(d.settlements, sCols, { empty: 'None in this period.' })}</div>`);
  },

  async orders(q) {
    shell('orders', loading('Website orders'));
    const d = await api('/api/orders?' + qs({ status: q.status }));
    const order = ['NEW', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'AT_STATION', 'OUT_FOR_DELIVERY', 'ON_HOLD', 'DELIVERED', 'RETURN_STARTED', 'RETURN_BOOKED', 'RETURN_SHIPPED', 'RETURN_RECEIVED', 'RTO', 'CANCELLED', 'CLOSED'];
    const keys = [...new Set([...order.filter(k => d.counts[k]), ...Object.keys(d.counts)])];
    const chips = `<div class="chips"><button class="${!d.status ? 'on' : ''}" data-s="">All</button>${keys.map(k => `<button class="${d.status === k ? 'on' : ''}" data-s="${k}">${k.replace(/_/g, ' ').toLowerCase()} ${d.counts[k]}</button>`).join('')}</div>`;
    const cols = [{ k: 'order_no', t: 'Order', f: (v, r) => `<b>${esc(v)}</b><div class="xs mut">${dt(r.placed_at)}</div>` }, { k: 'name', t: 'Customer', f: (v, r) => `${esc(v || '')}<div class="xs mut">${[r.phone, r.city].filter(Boolean).map(esc).join(' · ')}</div>` }, { k: 'total', t: 'Total', num: true, f: rs }, { k: 'status', t: 'Status', f: statusPill },
      { k: 'courier', t: 'Courier', f: (v, r) => `${esc(v || '')}${r.tracking_no ? `<div class="xs mono">${esc(r.tracking_no)}</div>` : ''}` }, { k: 'agent', t: 'Agent' }, { k: 'delivered_at', t: 'Delivered', f: v => v ? dt(v) : '' }];
    shell('orders', `<h1 class="pt">Website orders</h1>${chips}<div class="card"><h2>${d.status ? esc(d.status.replace(/_/g, ' ').toLowerCase()) : 'Latest 200'}<span class="tools">${csvBtn('orders', d.rows, cols)}</span></h2>${table(d.rows, cols, { empty: 'No orders.' })}</div>`);
    document.querySelectorAll('.chips [data-s]').forEach(b => b.onclick = () => { location.hash = '#/orders' + (b.dataset.s ? '?' + qs({ status: b.dataset.s }) : ''); });
  },


  // P101 — where the website's visitors came from, and what became of them.
  // The column that matters is DELIVERED, not placed: cash on delivery means a
  // placed order is a promise, and a channel whose orders come back is a cost.
  async traffic(q) {
    q = { period: q.period || 'Last 7 Days', from: q.from, to: q.to };
    shell('traffic', loading('Traffic'));
    const go = nq => { location.hash = '#/traffic?' + qs(nq); };
    let d; try { d = await api('/api/traffic?' + qs(q)); } catch (e) { shell('traffic', `<h1 class="pt">Traffic</h1>${periodBar(q, go)}${errCard(e)}`); return; }
    const t = d.totals;
    const pc = v => v == null ? '—' : v + '%';
    const tiles = [
      tile('Visitors', n0(t.visitors), `${n0(t.sessions)} visit${t.sessions === 1 ? '' : 's'} · ${n0(t.views)} page views`),
      tile('Orders', n0(t.orders), `${pc(t.conversion_pct)} of visits`),
      tile('Delivered', rs(t.delivered), `placed ${rs(t.placed)}`),
      tile('WhatsApp clicks', n0(t.wa_clicks), `${n0(t.call_clicks)} called · ${n0(t.directions)} asked directions`),
    ].join('');

    const chCols = [
      { k: 'channel', t: 'Channel', f: (v, r) => `${esc(v)}${r.paid ? ' ' + pill('paid', 'b') : ''}` },
      { k: 'visitors', t: 'Visitors', num: true, f: n0 }, { k: 'sessions', t: 'Visits', num: true, f: n0 },
      { k: 'orders', t: 'Orders', num: true, f: n0 },
      { k: 'conversion_pct', t: 'Conv.', num: true, f: pc },
      { k: 'delivered', t: 'Delivered', num: true, f: rs },
      { k: 'placed', t: 'Placed', num: true, f: rs },
      { k: 'rto_pct', t: 'Came back', num: true, f: (v, r) => v == null ? (r.in_flight ? `<span class="xs mut">${r.in_flight} still out</span>` : '—') : `${v}%` },
      { k: 'wa_clicks', t: 'WhatsApp', num: true, f: n0 },
    ];
    const note = d.untracked_orders
      ? `<div class="xs mut" style="margin-top:8px">${n0(d.untracked_orders)} order${d.untracked_orders === 1 ? '' : 's'} in this period could not be matched to a visit — placed before the visit log started, or the browser closed before it reported. ${d.untracked_orders === 1 ? 'It is' : 'They are'} counted from the order's own tag instead.</div>`
      : '';

    const f = d.funnel;
    const funnel = `<div class="funnel">${f.map((s2, i) => {
      const prev = i ? f[i - 1].sessions : s2.sessions;
      const kept = prev ? Math.round(s2.sessions / prev * 100) : 0;
      return `<div class="fstep"><div class="fbar" style="width:${Math.max(2, s2.of_visits_pct || 0)}%"></div>
        <div class="flabel"><b>${esc(s2.label)}</b><span>${n0(s2.sessions)}${i ? ` · ${kept}% of the step before` : ''}</span></div></div>`;
    }).join('')}</div>`;

    const waCols = [{ k: 'place', t: 'Where on the page' }, { k: 'clicks', t: 'Clicks', num: true, f: n0 }];
    const pgCols = [{ k: 'path', t: 'Page' }, { k: 'views', t: 'Views', num: true, f: n0 }, { k: 'sessions', t: 'Visits', num: true, f: n0 }];
    const prCols = [{ k: 'code', t: 'Product' }, { k: 'views', t: 'Views', num: true, f: n0 }, { k: 'sessions', t: 'Visits', num: true, f: n0 }];
    const seCols = [{ k: 'term', t: 'Searched for', f: (v, r) => `${esc(v)}${r.fewest_results === 0 ? ' ' + pill('nothing found', 'r') : ''}` },
      { k: 'times', t: 'Times', num: true, f: n0 }, { k: 'fewest_results', t: 'Results', num: true, f: n0 }];
    const dvCols = [{ k: 'device', t: 'On' }, { k: 'sessions', t: 'Visits', num: true, f: n0 }];
    const apCols = [{ k: 'app', t: 'Opened inside' }, { k: 'sessions', t: 'Visits', num: true, f: n0 }];
    const coCols = [{ k: 'country', t: 'Country' }, { k: 'sessions', t: 'Visits', num: true, f: n0 }];
    const card = (title, name, rows, cols, empty) => `<div class="card"><h2>${title}<span class="tools">${csvBtn(name, rows, cols)}</span></h2>${table(rows, cols, { empty })}</div>`;
    // P103 — spend beside what it brought back. Cost per DELIVERED order is the
    // honest one: an advert whose parcels come back has bought nothing.
    const spCols = [{ k: 'channel', t: 'Channel' }, { k: 'spend', t: 'Spent', num: true, f: v => v == null ? '—' : rs(v) },
      { k: 'orders', t: 'Orders', num: true, f: n0 }, { k: 'cost_per_order', t: 'Per order', num: true, f: v => v == null ? '—' : rs(v) },
      { k: 'cost_per_delivered', t: 'Per delivered', num: true, f: v => v == null ? '—' : rs(v) },
      { k: 'delivered', t: 'Brought back', num: true, f: rs },
      { k: 'roas', t: 'Return', num: true, f: v => v == null ? '—' : `${v}×` }];
    const spendCard = d.spend && d.spend.any
      ? `<div class="card"><h2>What the ads cost, and what came back<span class="tools">${csvBtn('traffic-spend', d.channels.filter(c => c.spend != null), spCols)}</span></h2>
          ${table(d.channels.filter(c => c.spend != null), spCols, { empty: 'No spend entered for this period.' })}
          <div class="xs mut" style="margin-top:8px">Spend is entered by month on the POS (Website ▸ Links &amp; QR).${d.spend.pro_rated ? ' This period is not a whole month, so each month\'s spend is spread evenly across its days — treat these as close, not exact.' : ''} "Return" is delivered revenue for every rupee spent.</div></div>`
      : '';
    const series = d.series.length > 1 ? `<div class="card"><h2>Day by day</h2>${barChart(d.series, 'sessions', p => dd(p.day))}</div>` : '';
    const zero = !t.sessions
      ? `<div class="card notice"><b>Nothing recorded yet for this period.</b> The visit log started on 19 September 2026 — pick a period since then, and give it a little time to fill.</div>` : '';

    shell('traffic', `<h1 class="pt">Traffic <small>${esc(dd(d.from))} – ${esc(dd(d.to))}</small></h1>${periodBar(q, go)}${zero}
      <div class="tiles">${tiles}</div>
      <div class="card"><h2>Where they came from<span class="tools">${csvBtn('traffic-by-channel', d.channels, chCols)}</span></h2>
        ${table(d.channels, chCols, { empty: 'No visits in this period.' })}${note}</div>
      <div class="cols">
        <div class="card"><h2>From first visit to order</h2>${funnel}</div>
        ${card('WhatsApp, by where they clicked', 'traffic-whatsapp', d.whatsapp, waCols, 'Nobody clicked WhatsApp in this period.')}
      </div>
      ${spendCard}
      ${series}
      <div class="cols">${card('Most looked at', 'traffic-pages', d.pages, pgCols, 'No pages yet.')}${card('Most looked at products', 'traffic-products', d.products, prCols, 'No product pages opened yet.')}</div>
      ${card('What people searched for — what they could not find comes first', 'traffic-searches', d.searches, seCols, 'Nobody has used the search box yet.')}
      <div class="cols">${card('What they used', 'traffic-devices', d.devices, dvCols)}${d.apps.length ? card('Opened inside an app', 'traffic-apps', d.apps, apCols) : card('Where they are', 'traffic-countries', d.countries, coCols)}</div>
      ${d.apps.length ? card('Where they are', 'traffic-countries', d.countries, coCols) : ''}`);
  },

  async logins() {
    shell('logins', loading('Logins'));
    const d = await api('/api/logins');
    const cols = [{ k: 'at', t: 'When', f: dt }, { k: 'username', t: 'Username' }, { k: 'ok', t: '', f: (v, r) => v ? (r.why === 'new_device' ? pill('ok · new device', 'a') : pill('ok', 'g')) : pill(r.why === 'ip_lock' ? 'too many from this address' : r.why || 'refused', 'r') }, { k: 'ip', t: 'From', f: v => `<span class="mono">${esc(v || '')}</span>` }, { k: 'agent', t: 'Device', f: v => `<span class="xs mut">${esc((v || '').slice(0, 80))}</span>` }];
    shell('logins', `<h1 class="pt">Portal logins</h1><div class="card"><h2>Last 200 attempts<span class="tools">${csvBtn('portal-logins', d.rows, cols)}</span></h2>${table(d.rows, cols, { empty: 'Nobody yet.' })}</div>`);
  },
};

// ── router ──────────────────────────────────────────────────────────────────
async function route() {
  if (!me) {
    try { me = await api('/api/auth/me'); } catch { loginPage(); return; }
  }
  const h = location.hash.replace(/^#\/?/, '');
  const [pathPart, qPart] = h.split('?');
  const q = Object.fromEntries(new URLSearchParams(qPart || '').entries());
  const [name, id] = pathPart.split('/');
  const singular = { bill: 'bills', product: 'products' };
  const page = pages[name] ? name : null;
  const first = PAGES.find(p => can(p[2]));
  if (!page || (!singular[name] && !PAGES.some(p => p[0] === name && can(p[2])))) { location.hash = first ? '#/' + first[0] : ''; if (!first) app.innerHTML = '<main class="login"><div class="card"><h1>Nothing to show</h1><p class="mut">This account holds no report key on the POS.</p></div></main>'; return; }
  // first pass from the cache (instant, marked "updating…"), second from the portal
  const seq = ++routeSeq;
  paintingFromCache = true;
  let painted = false;
  try { await pages[page](q, id); painted = true; } catch { /* nothing cached for this page yet */ }
  paintingFromCache = false;
  suppressLoading = painted;
  try { if (seq === routeSeq) await pages[page](q, id); }
  catch (e) { if (e.message !== 'UNAUTHENTICATED' && seq === routeSeq) shell(singular[name] || name, `<h1 class="pt">${esc(name)}</h1>${errCard(e)}`); }
  finally { suppressLoading = false; }
}
let routeSeq = 0;
window.addEventListener('hashchange', route);
route();
