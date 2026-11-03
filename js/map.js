// js/map.js — Leaflet init, layers, route highlight/clear. Safe if Leaflet is missing.
// Phase 2+ API: addRoutes([{ id, label, sub, search, layer, color, latlngs, popupHtml }])

export const CEBU_CENTER = [10.3157, 123.8854];
export const DEFAULT_ZOOM = 12;
const METRO_BOUNDS = [[10.15, 123.65], [10.65, 124.15]];
const LAYERS = ['jeepney', 'bus', 'terminals', 'places'];
const NORMAL = { weight: 4, opacity: 0.9 };
const FADED = { weight: 3, opacity: 0.25 };
const ACTIVE = { weight: 6, opacity: 1 };

let map = null;
const groups = {};
const routes = new Map();
let selectedId = null;
let listEl = null;
let query = '';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function safeColor(hex, fallback = '#555555') {
  return /^#[0-9a-f]{6}$/i.test(String(hex)) ? String(hex) : fallback;
}

// Pick black or white text, whichever has higher contrast on the pill color.
export function textColorFor(hex) {
  const c = safeColor(hex).slice(1);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

export const isReady = () => map !== null;

export function initMap(el, onReady) {
  if (!el || typeof L === 'undefined') return false;
  try {
    map = L.map(el, {
      center: CEBU_CENTER, zoom: DEFAULT_ZOOM, minZoom: 11, maxZoom: 18,
      maxBounds: METRO_BOUNDS, maxBoundsViscosity: 0.8,
    });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    LAYERS.forEach((name) => { groups[name] = L.layerGroup().addTo(map); });
    routes.forEach(attach);
    if (typeof onReady === 'function') {
      tiles.once('load', onReady);
      setTimeout(onReady, 6000);
    }
    return true;
  } catch (err) {
    map = null;
    return false;
  }
}

export function invalidate() {
  if (map) map.invalidateSize();
}

function attach(r) {
  if (!map || r.line || !groups[r.layer]) return;
  r.line = L.polyline(r.latlngs, { color: r.color, lineJoin: 'round', ...NORMAL });
  r.line.on('click', () => selectRoute(r.id));
  r.line.addTo(groups[r.layer]);
}

export function addRoutes(items) {
  let added = 0;
  (Array.isArray(items) ? items : []).forEach((r) => {
    if (!r || !r.id || !r.label || !LAYERS.includes(r.layer)) return;
    const pts = Array.isArray(r.latlngs)
      ? r.latlngs.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      : [];
    if (pts.length < 2) return;
    const old = routes.get(String(r.id));
    if (old && old.line) old.line.remove();
    const route = {
      id: String(r.id), label: String(r.label), sub: String(r.sub || ''), search: String(r.search || ''),
      layer: r.layer, color: safeColor(r.color), latlngs: pts, popupHtml: r.popupHtml || '', line: null,
    };
    routes.set(route.id, route);
    attach(route);
    added += 1;
  });
  renderList();
  return added;
}

export function setLayerVisible(name, visible) {
  const box = document.querySelector(`input[data-layer="${name}"]`);
  if (box) box.checked = visible;
  const g = groups[name];
  if (!map || !g) return;
  if (visible) map.addLayer(g); else map.removeLayer(g);
  const sel = routes.get(selectedId);
  if (!visible && sel && sel.layer === name) clearSelection();
}

export function selectRoute(id) {
  const r = routes.get(id);
  if (!r) return;
  selectedId = id;
  setLayerVisible(r.layer, true);
  routes.forEach((o) => {
    if (o.line) o.line.setStyle(o.id === id ? ACTIVE : FADED);
  });
  if (map && r.line) {
    r.line.bringToFront();
    map.fitBounds(r.line.getBounds(), { padding: [48, 48], animate: false });
    L.popup({ maxWidth: 280 })
      .setLatLng(r.latlngs[Math.floor(r.latlngs.length / 2)])
      .setContent(r.popupHtml || escapeHtml(r.label))
      .openOn(map);
  }
  renderList();
  document.dispatchEvent(new CustomEvent('route:selected', { detail: { id } }));
}

export function clearSelection() {
  const had = selectedId !== null;
  selectedId = null;
  routes.forEach((o) => { if (o.line) o.line.setStyle(NORMAL); });
  if (map) {
    map.closePopup();
    if (had) map.setView(CEBU_CENTER, DEFAULT_ZOOM, { animate: false });
  }
  renderList();
  document.dispatchEvent(new CustomEvent('route:cleared'));
}

export function setQuery(q) {
  query = String(q || '').trim().toLowerCase();
  renderList();
}

export function bindList(el) {
  listEl = el;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    if (selectedId === btn.dataset.id) clearSelection(); else selectRoute(btn.dataset.id);
  });
  renderList();
}

export function renderList() {
  if (!listEl) return;
  const active = document.activeElement;
  const keepId = active && listEl.contains(active) && active.dataset ? active.dataset.id : null;
  const rows = [...routes.values()].filter((r) => (
    !query || `${r.label} ${r.sub} ${r.search} ${r.layer}`.toLowerCase().includes(query)
  ));
  listEl.textContent = '';
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = routes.size === 0
      ? 'Coming soon: jeepney and bus routes will appear here.'
      : `No routes match “${query}”.`;
    listEl.append(li);
    return;
  }
  rows.forEach((r) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'route-btn';
    btn.dataset.id = r.id;
    btn.setAttribute('aria-pressed', String(r.id === selectedId));
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = r.label;
    pill.style.background = r.color;
    pill.style.color = textColorFor(r.color);
    const sub = document.createElement('span');
    sub.textContent = r.sub;
    btn.append(pill, sub);
    li.append(btn);
    listEl.append(li);
  });
  if (keepId) {
    const again = listEl.querySelector(`[data-id="${CSS.escape(keepId)}"]`);
    if (again) again.focus({ preventScroll: true });
  }
}
