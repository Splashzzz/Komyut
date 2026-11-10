// js/bus.js — Bus tab: terminals, city routes and provincial routes; feeds the map layers.
import { loadBus, confidenceInfo, busMinFare, faresReady, pathsReady } from './data.js';
import * as MapView from './map.js';

const $ = (sel) => document.querySelector(sel);
const esc = MapView.escapeHtml;
const TYPE_LABELS = { aircon: 'Aircon', ordinary: 'Ordinary' };
let data = { terminals: [], routes: [] };
let provincialNote = '';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const isProvincial = (r) => r.category === 'provincial';
const typeLabel = (r) => TYPE_LABELS[r.busType] || (isProvincial(r) ? 'Bus class varies by operator' : 'Bus type not confirmed');

function fareText(r) {
  if (isProvincial(r)) return 'Depends on bus class (see the provincial fare note)';
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

function routePopup(r, approx) {
  const info = confidenceInfo(r.confidence);
  const via = r.via.length ? `<div>Via: ${r.via.map(esc).join(', ')}</div>` : '';
  const line = approx ? 'Dashed line: rough estimate, not snapped to roads.' : 'Line snapped to roads.';
  return `<div class="popup">
    <span class="pill" style="background:${r.color};color:${MapView.textColorFor(r.color)}">${esc(r.id)}</span>
    <strong>${esc(r.operator || 'Bus')}</strong>
    <div>${esc(r.from)} → ${esc(r.to)}</div>${via}
    <div>${esc(typeLabel(r))} · Min. fare: ${esc(fareText(r))}</div>
    <span class="badge ${info.cls}">${esc(info.label)}</span>
    <div class="popup-note">${line} Routes are approximate. Confirm with the driver or barker.</div>
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
  li.append(el('p', 'card-meta', [r.operator, typeLabel(r)].filter(Boolean).join(' · ')));
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
  const pl = $('#bus-provincial');
  tl.textContent = '';
  rl.textContent = '';
  pl.textContent = '';
  const city = data.routes.filter((r) => !isProvincial(r));
  const prov = data.routes.filter(isProvincial).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  data.terminals.forEach((t) => tl.append(terminalCard(t)));
  city.forEach((r) => rl.append(routeCard(r)));
  prov.forEach((r) => pl.append(routeCard(r)));
  if (data.terminals.length === 0) tl.append(note('No terminals available yet.'));
  if (city.length === 0) rl.append(note('No city bus routes available yet.'));
  $('#bus-routes-section').hidden = false;
  $('#bus-provincial-section').hidden = prov.length === 0;
  $('#bus-provincial-note').textContent = provincialNote;
  $('#bus-status').textContent = `${data.terminals.length} terminals · ${city.length} city routes · ${prov.length} provincial routes`;
}

function showSkeleton() {
  ['#bus-terminals', '#bus-routes'].forEach((sel) => {
    const list = $(sel);
    list.textContent = '';
    for (let i = 0; i < 2; i += 1) list.append(el('li', 'card skeleton-card'));
  });
  $('#bus-provincial').textContent = '';
  $('#bus-routes-section').hidden = false;
  $('#bus-provincial-section').hidden = true;
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
  $('#bus-provincial-section').hidden = true;
  $('#bus-status').textContent = '';
}

async function load() {
  showSkeleton();
  const [res, faresRes, paths] = await Promise.all([loadBus(), faresReady, pathsReady]);
  if (!res.ok) {
    showError();
    return;
  }
  data = res.data;
  provincialNote = faresRes && faresRes.ok && faresRes.data ? faresRes.data.provincial_note : '';
  try {
    MapView.addMarkers(data.terminals.map((t) => ({
      id: `terminal:${t.id}`,
      layer: 'terminals',
      latlng: [t.lat, t.lng],
      title: t.name,
      iconHtml: '🚌',
      popupHtml: terminalPopup(t),
    })));
    MapView.addRoutes(data.routes.map((r) => {
      const snapped = paths[`bus:${r.id}`];
      return {
        id: `bus:${r.id}`,
        label: r.id,
        sub: `${r.from} → ${r.to}`,
        search: [r.operator, r.via.join(' ')].join(' '),
        group: isProvincial(r) ? 'Provincial bus' : 'City bus',
        layer: isProvincial(r) ? 'provincial' : 'bus',
        color: r.color,
        latlngs: snapped || r.waypoints,
        approx: !snapped,
        meta: {
          kind: 'bus', provincial: isProvincial(r), busType: r.busType, name: r.operator, from: r.from, to: r.to, via: r.via,
        },
        popupHtml: routePopup(r, !snapped),
      };
    }));
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
  ['#bus-routes', '#bus-provincial'].forEach((sel) => {
    $(sel).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-route]');
      if (btn) goToMap(() => MapView.selectRoute(`bus:${btn.dataset.route}`));
    });
  });
}

export function initBus() {
  const ids = ['#bus-terminals', '#bus-routes', '#bus-routes-section', '#bus-provincial', '#bus-provincial-section', '#bus-provincial-note', '#bus-status'];
  if (ids.some((sel) => !$(sel))) return;
  wire();
  load();
}
