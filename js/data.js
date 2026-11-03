// js/data.js — fetch + validate JSON. Never throws; callers get { ok, data, error }.

export const CONFIDENCE = {
  verified: { label: 'Verified (multiple sources)', cls: 'badge--verified' },
  community: { label: 'Community-reported', cls: 'badge--community' },
  unverified: { label: 'Unverified – help us confirm', cls: 'badge--unverified' },
};

export function confidenceInfo(value) {
  return Object.prototype.hasOwnProperty.call(CONFIDENCE, value) ? CONFIDENCE[value] : CONFIDENCE.unverified;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
// Rough Metro Cebu sanity range; catches swapped lat/lng.
const isLatLng = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
  && p[0] > 9 && p[0] < 12 && p[1] > 122 && p[1] < 125;
const confKey = (v) => (Object.prototype.hasOwnProperty.call(CONFIDENCE, v) ? v : 'unverified');

export async function loadJson(path, validate) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    return { ok: true, data: validate ? validate(raw) : raw, error: null };
  } catch (err) {
    return { ok: false, data: [], error: String(err && err.message ? err.message : err) };
  }
}

// ---- Jeepney ----
export function validateJeepney(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map((r) => {
    if (!r || typeof r !== 'object') return null;
    const code = str(r.code);
    const waypoints = Array.isArray(r.waypoints) ? r.waypoints.filter(isLatLng) : [];
    if (!code || waypoints.length < 2 || seen.has(code)) return null;
    seen.add(code);
    return {
      code,
      name: str(r.name) || code,
      type: r.type === 'modern' ? 'modern' : 'traditional',
      from: str(r.from),
      to: str(r.to),
      via: strList(r.via),
      waypoints,
      color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#555555',
      hours: str(r.operating_hours),
      confidence: confKey(r.confidence),
      notes: str(r.notes),
    };
  }).filter(Boolean);
}

export const JEEPNEY_FILES = ['data/jeepney.json', 'data/jeepney-2.json'];

export async function loadJeepney() {
  const parts = await Promise.all(JEEPNEY_FILES.map((f) => loadJson(f, validateJeepney)));
  const okParts = parts.filter((p) => p.ok);
  const seen = new Set();
  const data = okParts.flatMap((p) => p.data).filter((r) => (seen.has(r.code) ? false : seen.add(r.code)));
  return {
    ok: okParts.length > 0,
    data,
    partial: okParts.length > 0 && okParts.length < parts.length,
    error: okParts.length > 0 ? null : parts[0].error,
  };
}

// Fare hook: setFares() is called when data/fares.json loads; popups read these helpers.
let faresData = null;
export function setFares(f) {
  faresData = f && typeof f === 'object' ? f : null;
}
export function jeepneyMinFare(type) {
  const rule = faresData ? faresData[type === 'modern' ? 'jeepney_modern' : 'jeepney_traditional'] : null;
  return rule && Number.isFinite(rule.min_fare) ? rule.min_fare : null;
}
export function busMinFare(type) {
  if (type !== 'ordinary' && type !== 'aircon') return null;
  const rule = faresData && faresData.bus ? faresData.bus[type] : null;
  return rule && Number.isFinite(rule.min_fare) ? rule.min_fare : null;
}

// ---- Bus ----
export function validateBus(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const terminals = (Array.isArray(src.terminals) ? src.terminals : []).map((t) => {
    if (!t || typeof t !== 'object' || !str(t.id) || !str(t.name) || !isLatLng([t.lat, t.lng])) return null;
    return {
      id: str(t.id), name: str(t.name), lat: t.lat, lng: t.lng, address: str(t.address),
      operators: strList(t.operators), destinations: strList(t.destinations),
      confidence: confKey(t.confidence), notes: str(t.notes),
    };
  }).filter(Boolean);
  const seen = new Set();
  const routes = (Array.isArray(src.routes) ? src.routes : []).map((r) => {
    if (!r || typeof r !== 'object') return null;
    const id = str(r.id);
    const waypoints = Array.isArray(r.waypoints) ? r.waypoints.filter(isLatLng) : [];
    if (!id || !str(r.from) || !str(r.to) || waypoints.length < 2 || seen.has(id)) return null;
    seen.add(id);
    return {
      id, operator: str(r.operator), from: str(r.from), to: str(r.to), via: strList(r.via), waypoints,
      busType: r.bus_type === 'ordinary' || r.bus_type === 'aircon' ? r.bus_type : '',
      minutes: Number.isFinite(r.est_duration_min) ? r.est_duration_min : null,
      color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#455a64',
      confidence: confKey(r.confidence), notes: str(r.notes),
    };
  }).filter(Boolean);
  return { terminals, routes };
}

export const loadBus = () => loadJson('data/bus.json', validateBus);

// ---- Places (split across two files to keep each file small) ----
const PLACE_CATS = ['mall', 'park', 'theme_park', 'historic', 'religious', 'market', 'beach', 'other'];
const PLACE_MODES = ['jeepney', 'bus', 'taxi', 'walk', 'tricycle', 'habal-habal', 'ferry'];
export const PLACES_FILES = ['data/places.json', 'data/places-2.json'];

export function validatePlaces(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    if (!p || typeof p !== 'object' || !str(p.id) || !str(p.name) || !isLatLng([p.lat, p.lng])) return null;
    const commute = (Array.isArray(p.how_to_commute) ? p.how_to_commute : []).map((o) => {
      if (!o || typeof o !== 'object' || !str(o.from)) return null;
      const steps = (Array.isArray(o.steps) ? o.steps : []).map((s) => {
        if (!s || typeof s !== 'object' || !PLACE_MODES.includes(s.mode) || !str(s.instruction)) return null;
        return {
          mode: s.mode, line: str(s.line), instruction: str(s.instruction),
          fare: Number.isFinite(s.est_fare) ? s.est_fare : null,
        };
      }).filter(Boolean);
      return steps.length ? { from: str(o.from), steps } : null;
    }).filter(Boolean);
    return {
      id: str(p.id), name: str(p.name),
      category: PLACE_CATS.includes(p.category) ? p.category : 'other',
      city: str(p.city), lat: p.lat, lng: p.lng, description: str(p.description),
      fee: str(p.entrance_fee), hours: str(p.hours), commute,
      confidence: confKey(p.confidence), notes: str(p.notes),
    };
  }).filter(Boolean);
}

export async function loadPlaces() {
  const parts = await Promise.all(PLACES_FILES.map((f) => loadJson(f, validatePlaces)));
  const okParts = parts.filter((p) => p.ok);
  const seen = new Set();
  const data = okParts.flatMap((p) => p.data).filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  return {
    ok: okParts.length > 0,
    data,
    partial: okParts.length > 0 && okParts.length < parts.length,
    error: okParts.length > 0 ? null : parts[0].error,
  };
}

// ---- Fares ----
const fareRule = (r) => (r && typeof r === 'object' && Number.isFinite(r.min_fare)
  && Number.isFinite(r.min_km) && Number.isFinite(r.per_km)
  ? { min_fare: r.min_fare, min_km: r.min_km, per_km: r.per_km } : null);

export function validateFares(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const bus = f.bus && typeof f.bus === 'object' ? f.bus : {};
  const rounding = f.rounding && typeof f.rounding === 'object' ? f.rounding : {};
  const dist = f.distance_estimate && typeof f.distance_estimate === 'object' ? f.distance_estimate : {};
  return {
    effective_date: str(f.effective_date),
    source_note: str(f.source_note),
    checked_on: str(f.checked_on),
    jeepney_traditional: fareRule(f.jeepney_traditional),
    jeepney_modern: fareRule(f.jeepney_modern),
    discount_pct: Number.isFinite(f.discount_pct) && f.discount_pct >= 0 && f.discount_pct < 100 ? f.discount_pct : 20,
    discount_applies_to: strList(f.discount_applies_to),
    bus: { ordinary: fareRule(bus.ordinary), aircon: fareRule(bus.aircon) },
    bus_note: str(f.bus_note),
    taxi_note: str(f.taxi_note),
    tricycle_note: str(f.tricycle_note),
    habal_note: str(f.habal_note),
    rounding: {
      step: Number.isFinite(rounding.step) && rounding.step > 0 ? rounding.step : 0.25,
      mode: rounding.mode === 'up' ? 'up' : 'nearest',
      note: str(rounding.note),
    },
    road_factor: Number.isFinite(dist.road_factor) && dist.road_factor >= 1 ? dist.road_factor : 1.3,
  };
}

export const loadFares = () => loadJson('data/fares.json', validateFares);

export async function reloadFares() {
  const res = await loadFares();
  if (res.ok) setFares(res.data);
  return res;
}

// Started once when this module loads; jeepney.js and bus.js wait for it so popups can show fares. Never rejects.
export const faresReady = reloadFares();
