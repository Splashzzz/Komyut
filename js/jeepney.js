// js/jeepney.js — Jeepney tab: load data, feed the map, render cards.
import { loadJeepney, confidenceInfo, jeepneyMinFare, faresReady } from './data.js';
import * as MapView from './map.js';

const $ = (sel) => document.querySelector(sel);
let routes = [];
let typeFilter = 'all';
let query = '';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function popupHtml(r) {
  const esc = MapView.escapeHtml;
  const info = confidenceInfo(r.confidence);
  const fare = jeepneyMinFare(r.type);
  const ends = [r.from, r.to].filter(Boolean).map(esc).join(' → ');
  const via = r.via.length ? `<div>Via: ${r.via.map(esc).join(', ')}</div>` : '';
  return `<div class="popup">
    <span class="pill" style="background:${r.color};color:${MapView.textColorFor(r.color)}">${esc(r.code)}</span>
    <strong>${esc(r.name)}</strong>
    <div>${ends}</div>${via}
    <div>Min. fare: ${fare === null ? 'not available yet' : '₱' + fare}</div>
    <span class="badge ${info.cls}">${esc(info.label)}</span>
    <div class="popup-note">Routes are approximate. Confirm with the driver or barker.</div>
  </div>`;
}

function card(r) {
  const info = confidenceInfo(r.confidence);
  const li = el('li', 'card');
  const head = el('div', 'card-head');
  const pill = el('span', 'pill', r.code);
  pill.style.background = r.color;
  pill.style.color = MapView.textColorFor(r.color);
  head.append(pill, el('h3', 'card-title', r.name));
  li.append(head);
  const typeLabel = r.type === 'modern' ? 'Modern' : 'Traditional';
  const ends = [r.from, r.to].filter(Boolean).join(' → ');
  li.append(el('p', 'card-meta', ends ? `${typeLabel} · ${ends}` : typeLabel));
  if (r.via.length) li.append(el('p', 'card-meta', `Via: ${r.via.join(', ')}`));
  if (r.hours) li.append(el('p', 'card-meta', `Hours: ${r.hours}`));
  if (r.notes) li.append(el('p', 'card-meta', r.notes));
  const foot = el('div', 'card-foot');
  foot.append(el('span', `badge ${info.cls}`, info.label));
  const btn = el('button', 'btn', `Show ${r.code} on map`);
  btn.type = 'button';
  btn.dataset.code = r.code;
  foot.append(btn);
  li.append(foot);
  return li;
}

function visible() {
  return routes.filter((r) => (typeFilter === 'all' || r.type === typeFilter)
    && (!query || [r.code, r.name, r.from, r.to, r.via.join(' ')].join(' ').toLowerCase().includes(query)));
}

function render() {
  const list = $('#jeepney-list');
  const status = $('#jeepney-status');
  if (!list || !status) return;
  const rows = visible();
  list.textContent = '';
  rows.forEach((r) => list.append(card(r)));
  if (rows.length > 0) status.textContent = `${rows.length} of ${routes.length} routes`;
  else if (routes.length === 0) status.textContent = 'No jeepney routes available yet.';
  else status.textContent = 'No routes match your search or filter. Try another code or landmark.';
}

function showSkeleton() {
  const list = $('#jeepney-list');
  list.textContent = '';
  for (let i = 0; i < 3; i += 1) list.append(el('li', 'card skeleton-card'));
  $('#jeepney-status').textContent = 'Loading jeepney routes…';
}

function showError() {
  const list = $('#jeepney-list');
  list.textContent = '';
  const li = el('li', 'card state');
  li.append(el('p', null, 'Couldn’t load jeepney routes. Check your connection, then try again.'));
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', load);
  li.append(retry);
  list.append(li);
  $('#jeepney-status').textContent = '';
}

async function load() {
  showSkeleton();
  const [res] = await Promise.all([loadJeepney(), faresReady]);
  if (!res.ok) {
    showError();
    return;
  }
  routes = res.data;
  try {
    MapView.addRoutes(routes.map((r) => ({
      id: `jeepney:${r.code}`,
      label: r.code,
      sub: r.name,
      search: [r.from, r.to, ...r.via].join(' '),
      layer: 'jeepney',
      color: r.color,
      latlngs: r.waypoints,
      popupHtml: popupHtml(r),
    })));
  } catch (err) {
    // Map layer is optional; the tab still works without it.
  }
  render();
}

function showOnMap(code) {
  const id = `jeepney:${code}`;
  const go = () => requestAnimationFrame(() => MapView.selectRoute(id));
  if (location.hash === '#map') {
    go();
    return;
  }
  window.addEventListener('hashchange', go, { once: true });
  location.hash = '#map';
}

function wire() {
  $('#jeepney-search').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll('[data-jtype]').forEach((b) => {
    b.addEventListener('click', () => {
      typeFilter = b.dataset.jtype;
      document.querySelectorAll('[data-jtype]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
  });
  $('#jeepney-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-code]');
    if (btn) showOnMap(btn.dataset.code);
  });
}

export function initJeepney() {
  if (!$('#jeepney-list') || !$('#jeepney-search') || !$('#jeepney-status')) return;
  wire();
  load();
}
