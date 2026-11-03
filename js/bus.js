// js/bus.js — Bus tab: terminals + city bus routes; feeds the Terminals and Bus map layers.
import { loadBus, confidenceInfo, busMinFare, faresReady } from './data.js';
import * as MapView from './map.js';

const $ = (sel) => document.querySelector(sel);
const esc = MapView.escapeHtml;
const TYPE_LABELS = { aircon: 'Aircon', ordinary: 'Ordinary' };
let data = { terminals: [], routes: [] };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const typeLabel = (t) => TYPE_LABELS[t] || 'Bus type not confirmed';

function fareText(r) {
  const fare = busMinFare(r.busType);
  return fare === null ? 'Rate not yet verified' : `₱${fare} (LTFRB city-bus rate; operator may differ)`;
}

const timeText = (r) => (r.minutes === null ? 'Trip time not yet verified' : `About ${r.minutes} min`);

function terminalPopup(t) {
  const info = confidenceInfo(t.confidence);
  const addr = t.address ? `<div>${esc(t.address)}</div>` : '';
  const ops = t.operators.length ? `<div>Operators: ${t.operators.map(esc).join(', ')}</div>` : '';
  return `<div class="popup">
    <strong>${esc(t.name)}</strong>${addr}${ops}
    <span class="badge ${info.cls}">${esc(info.label)}</span>
    <div class="popup-note">Confirm the loading bay and schedule at the terminal.</div>
  </div>`;
}

function routePopup(r) {
  const info = confidenceInfo(r.confidence);
  const via = r.via.length ? `<div>Via: ${r.via.map(esc).join(', ')}</div>` : '';
  return `<div class="popup">
    <span class="pill" style="background:${r.color};color:${MapView.textColorFor(r.color)}">${esc(r.id)}</span>
    <strong>${esc(r.operator || 'Bus')}</strong>
    <div>${esc(r.from)} → ${esc(r.to)}</div>${via}
    <div>${esc(typeLabel(r.busType))} · Min. fare: ${esc(fareText(r))}</div>
    <span class="badge ${info.cls}">${esc(info.label)}</span>
    <div class="popup-note">Routes are approximate. Confirm with the driver or barker.</div>
  </div>`;
}

function footer(info, btn) {
  const foot = el('div', 'card-foot');
  foot.append(el('span', `badge ${info.cls}`, info.label), btn);
  return foot;
}

function terminalCard(t) {
  const li = el('li', 'card');
  const head = el('div', 'card-head');
  const icon = el('span', null, '🚌');
  icon.setAttribute('aria-hidden', 'true');
  head.append(icon, el('h4', 'card-title', t.name));
  li.append(head);
  if (t.address) li.append(el('p', 'card-meta', t.address));
  if (t.operators.length) li.append(el('p', 'card-meta', `Operators: ${t.operators.join(', ')}`));
  if (t.destinations.length) li.append(el('p', 'card-meta', `Destinations: ${t.destinations.join(', ')}`));
  if (t.notes) li.append(el('p', 'card-meta', t.notes));
  const btn = el('button', 'btn', 'Show on map');
  btn.type = 'button';
  btn.dataset.terminal = t.id;
  li.append(footer(confidenceInfo(t.confidence), btn));
  return li;
}

function routeCard(r) {
  const li = el('li', 'card');
  const head = el('div', 'card-head');
  const pill = el('span', 'pill', r.id);
  pill.style.background = r.color;
  pill.style.color = MapView.textColorFor(r.color);
  head.append(pill, el('h4', 'card-title', `${r.from} → ${r.to}`));
  li.append(head);
  li.append(el('p', 'card-meta', [r.operator, typeLabel(r.busType)].filter(Boolean).join(' · ')));
  if (r.via.length) li.append(el('p', 'card-meta', `Via: ${r.via.join(', ')}`));
  li.append(el('p', 'card-meta', `Min. fare: ${fareText(r)} · ${timeText(r)}`));
  if (r.notes) li.append(el('p', 'card-meta', r.notes));
  const btn = el('button', 'btn', `Show ${r.id} on map`);
  btn.type = 'button';
  btn.dataset.route = r.id;
  li.append(footer(confidenceInfo(r.confidence), btn));
  return li;
}

function note(msg) {
  const li = el('li', 'card state');
  li.append(el('p', null, msg));
  return li;
}

function render() {
  const tl = $('#bus-terminals');
  const rl = $('#bus-routes');
  tl.textContent = '';
  rl.textContent = '';
  data.terminals.forEach((t) => tl.append(terminalCard(t)));
  data.routes.forEach((r) => rl.append(routeCard(r)));
  if (data.terminals.length === 0) tl.append(note('No terminals available yet.'));
  if (data.routes.length === 0) rl.append(note('No bus routes available yet.'));
  $('#bus-routes-section').hidden = false;
  $('#bus-status').textContent = `${data.terminals.length} terminals · ${data.routes.length} routes`;
}

function showSkeleton() {
  ['#bus-terminals', '#bus-routes'].forEach((sel) => {
    const list = $(sel);
    list.textContent = '';
    for (let i = 0; i < 2; i += 1) list.append(el('li', 'card skeleton-card'));
  });
  $('#bus-routes-section').hidden = false;
  $('#bus-status').textContent = 'Loading bus data…';
}

function showError() {
  const list = $('#bus-terminals');
  list.textContent = '';
  const li = el('li', 'card state');
  li.append(el('p', null, 'Couldn’t load bus data. Check your connection, then try again.'));
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', load);
  li.append(retry);
  list.append(li);
  $('#bus-routes').textContent = '';
  $('#bus-routes-section').hidden = true;
  $('#bus-status').textContent = '';
}

async function load() {
  showSkeleton();
  const [res] = await Promise.all([loadBus(), faresReady]);
  if (!res.ok) {
    showError();
    return;
  }
  data = res.data;
  try {
    MapView.addMarkers(data.terminals.map((t) => ({
      id: `terminal:${t.id}`,
      layer: 'terminals',
      latlng: [t.lat, t.lng],
      title: t.name,
      iconHtml: '🚌',
      popupHtml: terminalPopup(t),
    })));
    MapView.addRoutes(data.routes.map((r) => ({
      id: `bus:${r.id}`,
      label: r.id,
      sub: `${r.from} → ${r.to}`,
      search: [r.operator, r.via.join(' ')].join(' '),
      layer: 'bus',
      color: r.color,
      latlngs: r.waypoints,
      popupHtml: routePopup(r),
    })));
  } catch (err) {
    // Map layers are optional; the tab still works without them.
  }
  render();
}

function goToMap(action) {
  const run = () => requestAnimationFrame(action);
  if (location.hash === '#map') {
    run();
    return;
  }
  window.addEventListener('hashchange', run, { once: true });
  location.hash = '#map';
}

function wire() {
  $('#bus-terminals').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-terminal]');
    if (btn) goToMap(() => MapView.showMarker(`terminal:${btn.dataset.terminal}`));
  });
  $('#bus-routes').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (btn) goToMap(() => MapView.selectRoute(`bus:${btn.dataset.route}`));
  });
}

export function initBus() {
  if (!$('#bus-terminals') || !$('#bus-routes') || !$('#bus-routes-section') || !$('#bus-status')) return;
  wire();
  load();
}
