// js/places.js — Places tab: search, category chips, commute accordions; feeds the Places map layer.
import { loadPlaces, confidenceInfo } from './data.js';
import * as MapView from './map.js';

const $ = (sel) => document.querySelector(sel);
const esc = MapView.escapeHtml;
const CATS = {
  mall: ['Malls', '🛍️'], park: ['Parks', '🌳'], theme_park: ['Theme parks', '🎡'], historic: ['Historic', '🏛️'],
  religious: ['Religious', '⛪'], market: ['Markets', '🧺'], beach: ['Beaches', '🏖️'], other: ['Other', '📍'],
};
const MODES = {
  jeepney: ['Jeepney', '🚐'], bus: ['Bus', '🚌'], taxi: ['Taxi', '🚕'], walk: ['Walk', '🚶'],
  tricycle: ['Tricycle', '🛺'], 'habal-habal': ['Habal-habal', '🏍️'], ferry: ['Ferry', '⛴️'],
};
let places = [];
let category = 'all';
let query = '';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const catLabel = (c) => (CATS[c] || CATS.other)[0];
const feeText = (p) => (p.fee ? `Entrance fee: ${p.fee}` : 'Entrance fee: not yet verified');
const hoursText = (p) => (p.hours ? `Hours: ${p.hours}` : 'Hours: not yet verified');

function popupHtml(p) {
  const info = confidenceInfo(p.confidence);
  return `<div class="popup">
    <strong>${esc(p.name)}</strong>
    <div>${esc(catLabel(p.category))}${p.city ? ' · ' + esc(p.city) : ''}</div>
    <div>${esc(feeText(p))}</div>
    <span class="badge ${info.cls}">${esc(info.label)}</span>
    <div class="popup-note">Open the Places tab for step-by-step directions.</div>
  </div>`;
}

function stepItem(s) {
  const [label, icon] = MODES[s.mode];
  const li = el('li', 'step');
  const mode = el('span', 'mode');
  const emoji = el('span', null, icon);
  emoji.setAttribute('aria-hidden', 'true');
  mode.append(emoji, document.createTextNode(` ${label}`));
  li.append(mode);
  if (s.line) li.append(el('span', 'pill pill--line', s.line));
  li.append(document.createTextNode(` ${s.instruction}`));
  if (s.mode !== 'walk') li.append(el('span', 'fare', s.fare === null ? 'Fare: not yet verified' : `Fare: ₱${s.fare}`));
  return li;
}

function originAccordion(o) {
  const d = el('details', 'acc');
  d.append(el('summary', null, `From ${o.from}`));
  const ol = el('ol', 'steps');
  o.steps.forEach((s) => ol.append(stepItem(s)));
  d.append(ol);
  return d;
}

function card(p) {
  const info = confidenceInfo(p.confidence);
  const li = el('li', 'card');
  const head = el('div', 'card-head');
  const icon = el('span', null, (CATS[p.category] || CATS.other)[1]);
  icon.setAttribute('aria-hidden', 'true');
  head.append(icon, el('h3', 'card-title', p.name));
  li.append(head);
  li.append(el('p', 'card-sub', `${catLabel(p.category)}${p.city ? ' · ' + p.city : ''}`));
  if (p.description) li.append(el('p', null, p.description));
  li.append(el('p', 'card-meta', feeText(p)), el('p', 'card-meta', hoursText(p)));
  if (p.notes) li.append(el('p', 'card-meta', p.notes));
  if (p.commute.length) {
    li.append(el('p', 'acc-title', 'How to get there'));
    p.commute.forEach((o) => li.append(originAccordion(o)));
  }
  const foot = el('div', 'card-foot');
  const btn = el('button', 'btn', 'Show on map');
  btn.type = 'button';
  btn.dataset.place = p.id;
  foot.append(el('span', `badge ${info.cls}`, info.label), btn);
  li.append(foot);
  return li;
}

function visible() {
  return places.filter((p) => (category === 'all' || p.category === category)
    && (!query || [p.name, p.description, p.city, catLabel(p.category)].join(' ').toLowerCase().includes(query)));
}

function renderChips() {
  const box = $('#places-chips');
  box.textContent = '';
  const counts = {};
  places.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
  const items = [['all', `All (${places.length})`]];
  Object.keys(CATS).forEach((c) => { if (counts[c]) items.push([c, `${CATS[c][0]} (${counts[c]})`]); });
  items.forEach(([key, text]) => {
    const b = el('button', 'chip', text);
    b.type = 'button';
    b.dataset.cat = key;
    b.setAttribute('aria-pressed', String(key === category));
    box.append(b);
  });
}

function render(partial) {
  const list = $('#places-list');
  const status = $('#places-status');
  const rows = visible();
  list.textContent = '';
  rows.forEach((p) => list.append(card(p)));
  let msg;
  if (rows.length > 0) msg = `${rows.length} of ${places.length} places`;
  else if (places.length === 0) msg = 'No places available yet.';
  else msg = 'No places match your search or filter. Try another name or category.';
  status.textContent = partial ? `${msg}. Some places could not be loaded.` : msg;
}

function showSkeleton() {
  const list = $('#places-list');
  list.textContent = '';
  for (let i = 0; i < 3; i += 1) list.append(el('li', 'card skeleton-card'));
  $('#places-status').textContent = 'Loading places…';
}

function showError() {
  const list = $('#places-list');
  list.textContent = '';
  const li = el('li', 'card state');
  li.append(el('p', null, 'Couldn’t load places. Check your connection, then try again.'));
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', load);
  li.append(retry);
  list.append(li);
  $('#places-chips').textContent = '';
  $('#places-status').textContent = '';
}

async function load() {
  showSkeleton();
  const res = await loadPlaces();
  if (!res.ok) {
    showError();
    return;
  }
  places = res.data;
  try {
    MapView.addMarkers(places.map((p) => ({
      id: `place:${p.id}`,
      layer: 'places',
      latlng: [p.lat, p.lng],
      title: p.name,
      iconHtml: (CATS[p.category] || CATS.other)[1],
      size: 36,
      popupHtml: popupHtml(p),
    })));
  } catch (err) {
    // Map layer is optional; the tab still works without it.
  }
  renderChips();
  render(res.partial);
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
  $('#places-search').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    render(false);
  });
  $('#places-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    category = b.dataset.cat;
    $('#places-chips').querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render(false);
  });
  $('#places-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-place]');
    if (b) goToMap(() => MapView.showMarker(`place:${b.dataset.place}`));
  });
}

export function initPlaces() {
  if (!$('#places-list') || !$('#places-search') || !$('#places-chips') || !$('#places-status')) return;
  wire();
  load();
}
