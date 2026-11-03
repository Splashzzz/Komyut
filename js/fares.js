// js/fares.js — Fares tab: table, discount info, calculator. Also fills the footer fare date.
import { faresReady, reloadFares, loadPlaces, loadBus } from './data.js';

const $ = (sel) => document.querySelector(sel);
const MODES = [
  ['jeepney_traditional', 'Traditional jeepney'],
  ['jeepney_modern', 'Modern jeepney'],
  ['bus_ordinary', 'Ordinary city bus'],
  ['bus_aircon', 'Air-conditioned city bus'],
];
let fares = null;
let points = [];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export const peso = (n) => `₱${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '')}`;

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function roundFare(x, rounding) {
  const q = x / rounding.step;
  const n = rounding.mode === 'up' ? Math.ceil(q - 1e-9) : Math.round(q);
  return Math.round(n * rounding.step * 100) / 100;
}

// fare = min_fare if km <= min_km, else min_fare + ceil(km - min_km) * per_km; then discount; then rounding.
export function calcFare(rule, km, discountPct, rounding) {
  const extraKm = km > rule.min_km ? Math.ceil(km - rule.min_km) : 0;
  const raw = rule.min_fare + extraKm * rule.per_km;
  const net = discountPct > 0 ? raw * (1 - discountPct / 100) : raw;
  return { raw, extraKm, fare: roundFare(net, rounding) };
}

function ruleFor(key) {
  if (!fares) return null;
  if (key === 'bus_ordinary') return fares.bus.ordinary;
  if (key === 'bus_aircon') return fares.bus.aircon;
  return fares[key] || null;
}

function renderTable() {
  const host = $('#fares-table');
  host.textContent = '';
  const wrap = el('div', 'table-wrap');
  const table = el('table', 'fare-table');
  table.append(el('caption', null, `Metro Cebu fares effective ${fares.effective_date || '(date not stated)'}`));
  const thead = el('thead');
  const hr = el('tr');
  ['Vehicle', 'Minimum fare', 'Covers first', 'Each extra km', `Discounted minimum (${fares.discount_pct}% off)`].forEach((h) => {
    const th = el('th', null, h);
    th.scope = 'col';
    hr.append(th);
  });
  thead.append(hr);
  const tbody = el('tbody');
  MODES.forEach(([key, label]) => {
    const rule = ruleFor(key);
    const tr = el('tr');
    const th = el('th', null, label);
    th.scope = 'row';
    tr.append(th);
    if (!rule) {
      const td = el('td', null, 'Rate not yet verified');
      td.colSpan = 4;
      tr.append(td);
    } else {
      const disc = calcFare(rule, 0, fares.discount_pct, fares.rounding).fare;
      [peso(rule.min_fare), `${rule.min_km} km`, peso(rule.per_km), peso(disc)].forEach((t) => tr.append(el('td', null, t)));
    }
    tbody.append(tr);
  });
  table.append(thead, tbody);
  wrap.append(table);
  host.append(wrap);
}

function renderInfo() {
  const host = $('#fares-info');
  host.textContent = '';
  const add = (title, lines) => {
    const kept = lines.filter(Boolean);
    if (kept.length === 0) return;
    host.append(el('h3', null, title));
    kept.forEach((t) => host.append(el('p', null, t)));
  };
  const who = fares.discount_applies_to.length ? fares.discount_applies_to.join(', ') : 'qualified passengers';
  add('Discounts', [`${fares.discount_pct}% off for ${who}. Show a valid ID and say so before you pay.`]);
  add('Buses', [fares.bus_note]);
  add('Taxi, tricycle and habal-habal', [fares.taxi_note, fares.tricycle_note, fares.habal_note]);
  add('Source', [fares.source_note, fares.checked_on ? `Last checked: ${fares.checked_on}.` : '', fares.rounding.note]);
}

function fillCalc() {
  const mode = $('#calc-mode');
  mode.textContent = '';
  MODES.forEach(([key, label]) => {
    const o = el('option', null, ruleFor(key) ? label : `${label} (rate not yet verified)`);
    o.value = key;
    mode.append(o);
  });
  ['#calc-from', '#calc-to'].forEach((sel) => {
    const s = $(sel);
    s.textContent = '';
    const first = el('option', null, 'Choose a place');
    first.value = '';
    s.append(first);
    points.forEach((p, i) => {
      const o = el('option', null, p.label);
      o.value = String(i);
      s.append(o);
    });
  });
  $('#calc-pct').textContent = String(fares.discount_pct);
}

const idx = (v) => (v === '' ? -1 : Number(v));

function update() {
  if (!fares) return;
  const out = $('#calc-result');
  out.textContent = '';
  const rule = ruleFor($('#calc-mode').value);
  if (!rule) {
    out.append(el('p', null, 'Rate not yet verified for this vehicle.'));
    return;
  }
  const manual = parseFloat($('#calc-km').value);
  const a = points[idx($('#calc-from').value)];
  const b = points[idx($('#calc-to').value)];
  let km = null;
  let label = '';
  if (Number.isFinite(manual) && manual > 0) {
    km = manual;
    label = 'Distance you entered';
  } else if (a && b) {
    km = haversineKm([a.lat, a.lng], [b.lat, b.lng]) * fares.road_factor;
    label = `Estimated road distance (straight line × ${fares.road_factor})`;
  }
  if (km === null) {
    out.append(el('p', null, 'Choose a start and an end, or enter a distance in km.'));
    return;
  }
  if (km < 0.05) {
    out.append(el('p', null, 'Those two places are the same spot. Choose two different places.'));
    return;
  }
  const discounted = document.querySelector('input[name="calc-type"]:checked').value === 'discounted';
  const r = calcFare(rule, km, discounted ? fares.discount_pct : 0, fares.rounding);
  out.append(el('p', null, `${label}: about ${km.toFixed(1)} km (estimate)`));
  out.append(el('p', 'big', `Estimated fare: ${peso(r.fare)}`));
  out.append(el('p', null, r.extraKm > 0
    ? `${peso(rule.min_fare)} covers the first ${rule.min_km} km, plus ${r.extraKm} extra km × ${peso(rule.per_km)} = ${peso(r.raw)}.`
    : `Within the first ${rule.min_km} km, so the minimum fare of ${peso(rule.min_fare)} applies.`));
  if (discounted) out.append(el('p', null, `${fares.discount_pct}% discount applied. Show a valid ID.`));
  const lead = fares.rounding.mode === 'up' ? 'Rounded up to' : 'Rounded to';
  out.append(el('p', null, `${lead} the nearest ${peso(fares.rounding.step)}. Estimate only; the fare guide posted in the vehicle settles it.`));
}

async function loadPoints() {
  const [pl, bus] = await Promise.all([loadPlaces(), loadBus()]);
  const list = [];
  if (pl.ok) pl.data.forEach((p) => list.push({ label: p.name, lat: p.lat, lng: p.lng }));
  if (bus.ok) bus.data.terminals.forEach((t) => list.push({ label: t.name, lat: t.lat, lng: t.lng }));
  list.sort((x, y) => x.label.localeCompare(y.label));
  return list;
}

function showError() {
  $('#fare-calc').hidden = true;
  $('#fares-info').textContent = '';
  $('#fares-status').textContent = '';
  const host = $('#fares-table');
  host.textContent = '';
  const box = el('div', 'card state');
  box.append(el('p', null, 'Couldn’t load fares. Check your connection, then try again.'));
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', () => start(true));
  box.append(retry);
  host.append(box);
}

async function start(retry) {
  $('#fares-status').textContent = 'Loading fares…';
  const res = retry ? await reloadFares() : await faresReady;
  if (!res.ok || !res.data) {
    showError();
    return;
  }
  fares = res.data;
  $('#fares-status').textContent = `Fares effective ${fares.effective_date || '(date not stated)'}.`;
  renderTable();
  renderInfo();
  const footerDate = $('#fare-date');
  if (footerDate) footerDate.textContent = fares.effective_date || 'not stated';
  points = await loadPoints();
  fillCalc();
  $('#fare-calc').hidden = false;
  update();
}

export function initFares() {
  if (!$('#fares-status') || !$('#fares-table') || !$('#fares-info') || !$('#fare-calc')) return;
  ['#calc-mode', '#calc-from', '#calc-to'].forEach((sel) => $(sel).addEventListener('change', update));
  $('#calc-km').addEventListener('input', update);
  document.querySelectorAll('input[name="calc-type"]').forEach((r) => r.addEventListener('change', update));
  start(false);
}
