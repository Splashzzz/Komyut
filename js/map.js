// js/map.js — Leaflet init, layers, markers, route highlight, trip-plan drawing. Safe if Leaflet is missing.
// Routes:  addRoutes([{ id, label, sub, search, group, layer, color, latlngs, approx, meta, popupHtml }])
// Markers: addMarkers([{ id, layer, latlng, title, iconHtml, size, popupHtml }])
// Events (on document): route:selected, plan:shown, selection:changed { active }

export const CEBU_CENTER = [10.3157, 123.8854];
export const DEFAULT_ZOOM = 12;
const ISLAND_BOUNDS = [[9.3, 123.15], [11.4, 124.3]];
const LAYERS = ['jeepney', 'bus', 'provincial', 'terminals', 'places'];
const HIDDEN_BY_DEFAULT = ['provincial'];
const GROUP_ORDER = ['Jeepney', 'City bus', 'Provincial bus'];
const NORMAL = { weight: 4, opacity: 0.9 };
const FADED = { weight: 3, opacity: 0.25 };
const ACTIVE = { weight: 6, opacity: 1 };

let map = null;
let planGroup = null;
const groups = {};
const routes = new Map();
const markers = new Map();
let selectedId = null;
let popupOpen = false;
let planActive = false;
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

function emit() {
  const active = selectedId !== null || popupOpen || planActive;
  document.dispatchEvent(new CustomEvent('selection:changed', { detail: { active } }));
}

// Emphasis rules: selected route stands out; a plan or selection fades the rest.
function restyle() {
  routes.forEach((o) => {
    if (!o.line) return;
    if (selectedId !== null) o.line.setStyle(o.id === selectedId ? ACTIVE : FADED);
    else if (planActive) o.line.setStyle(FADED);
    else o.line.setStyle(NORMAL);
  });
}

export function initMap(el, onReady) {
  if (!el || typeof L === 'undefined') return false;
  try {
    map = L.map(el, {
      center: CEBU_CENTER, zoom: DEFAULT_ZOOM, minZoom: 9, maxZoom: 18,
      maxBounds: ISLAND_BOUNDS, maxBoundsViscosity: 0.8,
    });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    LAYERS.forEach((name) => { groups[name] = L.layerGroup().addTo(map); });
    planGroup = L.layerGroup().addTo(map);
    HIDDEN_BY_DEFAULT.forEach((name) => {
      map.removeLayer(groups[name]);
      const box = document.querySelector(`input[data-layer="${name}"]`);
      if (box) box.checked = false;
    });
    map.on('popupopen', () => { popupOpen = true; emit(); });
    map.on('popupclose', () => { popupOpen = false; emit(); });
    routes.forEach(attach);
    markers.forEach(attachMarker);
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
  r.line = L.polyline(r.latlngs, {
    color: r.color, lineJoin: 'round', dashArray: r.approx ? '8 8' : null, ...NORMAL,
  });
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
    if (old && old.line && groups[old.layer]) groups[old.layer].removeLayer(old.line);
    const route = {
      id: String(r.id), label: String(r.label), sub: String(r.sub || ''), search: String(r.search || ''),
      group: String(r.group || 'Routes'), layer: r.layer, color: safeColor(r.color), latlngs: pts,
      approx: Boolean(r.approx), meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
      popupHtml: r.popupHtml || '', line: null,
    };
    routes.set(route.id, route);
    attach(route);
    added += 1;
  });
  renderList();
  restyle();
  return added;
}

// Read-only copy of the registered routes (used by the trip planner).
export function getRoutes() {
  return [...routes.values()].map((r) => ({
    id: r.id, label: r.label, sub: r.sub, layer: r.layer, color: r.color,
    latlngs: r.latlngs, approx: r.approx, meta: r.meta,
  }));
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

function clearPlanLayer() {
  if (planGroup) planGroup.clearLayers();
  planActive = false;
}

export function selectRoute(id) {
  const r = routes.get(id);
  if (!r) return;
  clearPlanLayer();
  selectedId = id;
  setLayerVisible(r.layer, true);
  restyle();
  if (map && r.line) {
    r.line.bringToFront();
    map.fitBounds(r.line.getBounds(), { padding: [48, 48], animate: false });
    L.popup({ maxWidth: 280 })
      .setLatLng(r.latlngs[Math.floor(r.latlngs.length / 2)])
      .setContent(r.popupHtml || escapeHtml(r.label))
      .openOn(map);
  }
  renderList();
  emit();
  document.dispatchEvent(new CustomEvent('route:selected', { detail: { id } }));
}

// Clears everything the user has opened: selected route, popups, trip plan drawing.
export function clearSelection() {
  const had = selectedId !== null || planActive || popupOpen;
  selectedId = null;
  clearPlanLayer();
  restyle();
  if (map) {
    map.closePopup();
    if (had) map.setView(CEBU_CENTER, DEFAULT_ZOOM, { animate: false });
  }
  renderList();
  emit();
}

// plan: { legs: [{ latlngs, color, label }], walks: [latlngs], from: { latlng, label }, to: { latlng, label } }
export function showPlan(plan, opts = {}) {
  if (!map || !planGroup || !plan) return false;
  clearPlanLayer();
  selectedId = null;
  map.closePopup();
  const bounds = [];
  (plan.walks || []).forEach((pts) => {
    if (!Array.isArray(pts) || pts.length < 2) return;
    L.polyline(pts, { color: '#455a64', weight: 4, opacity: 0.9, dashArray: '2 8', lineCap: 'round' }).addTo(planGroup);
    bounds.push(...pts);
  });
  (plan.legs || []).forEach((leg) => {
    if (!leg || !Array.isArray(leg.latlngs) || leg.latlngs.length < 2) return;
    L.polyline(leg.latlngs, { color: '#ffffff', weight: 12, opacity: 0.9, lineJoin: 'round' }).addTo(planGroup);
    const line = L.polyline(leg.latlngs, { color: safeColor(leg.color), weight: 7, opacity: 1, lineJoin: 'round' });
    if (leg.label) line.bindTooltip(String(leg.label), { sticky: true });
    line.addTo(planGroup);
    bounds.push(...leg.latlngs);
  });
  [[plan.from, 'A'], [plan.to, 'B']].forEach(([end, text]) => {
    if (!end || !Array.isArray(end.latlng)) return;
    const name = `${text}: ${end.label || ''}`.trim();
    const icon = L.divIcon({
      className: 'pin pin--plan', html: `<span aria-hidden="true" style="width:34px;height:34px;font-size:16px">${text}</span>`,
      iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -17],
    });
    L.marker(end.latlng, { icon, title: name, alt: name, keyboard: true }).bindPopup(escapeHtml(name)).addTo(planGroup);
    bounds.push(end.latlng);
  });
  planActive = true;
  restyle();
  if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], animate: false });
  renderList();
  emit();
  if (opts.collapse) document.dispatchEvent(new CustomEvent('plan:shown'));
  return true;
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

function mk(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function renderList() {
  if (!listEl) return;
  const active = document.activeElement;
  const keepId = active && listEl.contains(active) && active.dataset ? active.dataset.id : null;
  const rows = [...routes.values()].filter((r) => (
    !query || `${r.label} ${r.sub} ${r.search} ${r.group}`.toLowerCase().includes(query)
  ));
  listEl.textContent = '';
  if (rows.length === 0) {
    listEl.append(mk('p', 'empty', routes.size === 0 ? 'No routes loaded yet.' : `No routes match “${query}”.`));
    return;
  }
  const byGroup = new Map();
  rows.forEach((r) => {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  });
  const rank = (g) => (GROUP_ORDER.indexOf(g) < 0 ? 99 : GROUP_ORDER.indexOf(g));
  [...byGroup.keys()].sort((a, b) => rank(a) - rank(b)).forEach((name) => {
    const list = byGroup.get(name).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const wrap = mk('div', 'route-group');
    wrap.append(mk('h4', 'group-title', `${name} (${list.length})`));
    const ul = mk('ul', 'route-list');
    list.forEach((r) => {
      const li = mk('li');
      const btn = mk('button', 'route-btn');
      btn.type = 'button';
      btn.dataset.id = r.id;
      btn.setAttribute('aria-pressed', String(r.id === selectedId));
      const pill = mk('span', 'pill', r.label);
      pill.style.background = r.color;
      pill.style.color = textColorFor(r.color);
      btn.append(pill, mk('span', null, r.sub));
      li.append(btn);
      ul.append(li);
    });
    wrap.append(ul);
    listEl.append(wrap);
  });
  if (keepId) {
    const again = listEl.querySelector(`[data-id="${CSS.escape(keepId)}"]`);
    if (again) again.focus({ preventScroll: true });
  }
}

// Point markers (terminals, places).
function attachMarker(m) {
  if (!map || m.marker || !groups[m.layer]) return;
  const opts = { title: m.title, alt: m.title, keyboard: true };
  if (m.iconHtml) {
    const s = m.size || 44;
    opts.icon = L.divIcon({
      className: 'pin',
      html: `<span aria-hidden="true" style="width:${s}px;height:${s}px;font-size:${Math.round(s / 2)}px">${escapeHtml(m.iconHtml)}</span>`,
      iconSize: [s, s], iconAnchor: [s / 2, s / 2], popupAnchor: [0, -s / 2],
    });
  }
  m.marker = L.marker(m.latlng, opts);
  if (m.popupHtml) m.marker.bindPopup(m.popupHtml, { maxWidth: 280 });
  m.marker.addTo(groups[m.layer]);
}

export function addMarkers(items) {
  let added = 0;
  (Array.isArray(items) ? items : []).forEach((m) => {
    if (!m || !m.id || !LAYERS.includes(m.layer)) return;
    if (!Array.isArray(m.latlng) || !Number.isFinite(m.latlng[0]) || !Number.isFinite(m.latlng[1])) return;
    const old = markers.get(String(m.id));
    if (old && old.marker && groups[old.layer]) groups[old.layer].removeLayer(old.marker);
    const entry = {
      id: String(m.id), layer: m.layer, latlng: m.latlng, title: String(m.title || ''),
      popupHtml: m.popupHtml || '', iconHtml: String(m.iconHtml || ''), marker: null,
      size: Number.isFinite(m.size) ? m.size : 44,
    };
    markers.set(entry.id, entry);
    attachMarker(entry);
    added += 1;
  });
  return added;
}

export function showMarker(id) {
  const m = markers.get(id);
  if (!m) return;
  if (selectedId !== null || planActive) clearSelection();
  setLayerVisible(m.layer, true);
  if (map && m.marker) {
    map.setView(m.latlng, 15, { animate: false });
    m.marker.openPopup();
  }
}
