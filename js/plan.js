// js/plan.js — Plan a trip: pick From/To and get direct or one-transfer options computed from the loaded
// route lines (plus walking and taxi). Everything runs in the browser; no routing service is used.
import { loadPlaces, loadBus, faresReady } from './data.js';
import { calcFare, haversineKm, peso } from './fares.js';
import * as MapView from './map.js';

const $ = (sel) => document.querySelector(sel);
const WALK_MAX = 800;        // m: farthest we ask you to walk to or from a route line
const TRANSFER_MAX = 350;    // m: farthest walk between two routes when changing
const WALK_SPEED = 80;       // m per minute
const RIDE_SPEED = 250;      // m per minute (about 15 km/h with stops)
const WAIT_MIN = 6;          // minutes of waiting per boarding
const MIN_RIDE = 300;        // m: shorter rides are not worth suggesting
const APPROX_FACTOR = 1.25;  // rough lines are shorter than real roads
const SHORT_WALK = 1500;     // m: suggest walking when the trip is this short
const REF_LAT = 10.5;
const KY = 111320;
const KX = 111320 * Math.cos((REF_LAT * Math.PI) / 180);

let points = [];
let fares = null;
let current = [];
let context = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---------- geometry (local flat projection, metres) ----------
const toXY = (ll) => [ll[1] * KX, ll[0] * KY];
const toLL = (xy) => [xy[1] / KY, xy[0] / KX];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function prepare(route) {
  const xy = route.latlngs.map(toXY);
  const cum = [0];
  for (let i = 1; i < xy.length; i += 1) cum.push(cum[i - 1] + dist(xy[i - 1], xy[i]));
  return { route, xy, cum, total: cum[cum.length - 1] };
}

function nearest(pr, p) {
  let best = { d: Infinity, pos: 0, point: pr.xy[0] };
  for (let i = 0; i < pr.xy.length - 1; i += 1) {
    const a = pr.xy[i];
    const b = pr.xy[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    let t = len2 === 0 ? 0 : ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * vx, a[1] + t * vy];
    const d = dist(p, q);
    if (d < best.d) best = { d, pos: pr.cum[i] + t * Math.sqrt(len2), point: q };
  }
  return best;
}

function pointAt(pr, pos) {
  const p = Math.max(0, Math.min(pr.total, pos));
  let i = 1;
  while (i < pr.cum.length - 1 && pr.cum[i] < p) i += 1;
  const segLen = pr.cum[i] - pr.cum[i - 1];
  const t = segLen === 0 ? 0 : (p - pr.cum[i - 1]) / segLen;
  const a = pr.xy[i - 1];
  const b = pr.xy[i];
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

// The part of a route between two positions, in travel direction, as [lat, lng] points.
function slice(pr, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const out = [toLL(pointAt(pr, lo))];
  for (let i = 0; i < pr.cum.length; i += 1) if (pr.cum[i] > lo && pr.cum[i] < hi) out.push(toLL(pr.xy[i]));
  out.push(toLL(pointAt(pr, hi)));
  return from <= to ? out : out.reverse();
}

function samples(pr) {
  const step = Math.max(80, pr.total / 400);
  const out = [];
  for (let pos = 0; pos < pr.total; pos += step) out.push({ pos, p: pointAt(pr, pos) });
  out.push({ pos: pr.total, p: pr.xy[pr.xy.length - 1] });
  return out;
}

// ---------- fares ----------
function legFare(route, rideM) {
  if (!fares) return null;
  const meta = route.meta || {};
  let rule = null;
  if (meta.kind === 'jeepney') rule = meta.type === 'modern' ? fares.jeepney_modern : fares.jeepney_traditional;
  else if (meta.kind === 'bus' && !meta.provincial) rule = meta.busType === 'ordinary' ? fares.bus.ordinary : (meta.busType === 'aircon' ? fares.bus.aircon : null);
  if (!rule) return null;
  const km = (rideM / 1000) * (route.approx ? APPROX_FACTOR : 1);
  return {
    regular: calcFare(rule, km, 0, fares.rounding).fare,
    discounted: calcFare(rule, km, fares.discount_pct, fares.rounding).fare,
  };
}

function totalFare(legs) {
  const parts = legs.map((l) => legFare(l.pr.route, Math.abs(l.to - l.from)));
  if (parts.some((p) => p === null)) return null;
  return {
    regular: parts.reduce((s, p) => s + p.regular, 0),
    discounted: parts.reduce((s, p) => s + p.discounted, 0),
  };
}

// ---------- option search ----------
function landmarkNear(ll) {
  let best = null;
  points.forEach((p) => {
    const d = haversineKm(ll, [p.lat, p.lng]) * 1000;
    if (d <= 600 && (!best || d < best.d)) best = { d, label: p.label };
  });
  return best ? best.label : '';
}

function bestTransfer(a, b) {
  let best = null;
  samples(a.pr).forEach((s) => {
    const n = nearest(b.pr, s.p);
    if (n.d > TRANSFER_MAX) return;
    const rideA = Math.abs(s.pos - a.n.pos);
    const rideB = Math.abs(b.n.pos - n.pos);
    if (rideA < MIN_RIDE || rideB < MIN_RIDE) return;
    const cost = (a.n.d + n.d + b.n.d) / WALK_SPEED + (rideA + rideB) / RIDE_SPEED + 2 * WAIT_MIN;
    if (!best || cost < best.cost) best = { cost, posA: s.pos, posB: n.pos, pA: s.p, pB: n.point, walk: n.d };
  });
  return best;
}

function findRideOptions(o, d) {
  const prs = MapView.getRoutes().filter((r) => r.latlngs.length > 1).map(prepare);
  const near = (p) => prs.map((pr) => ({ pr, n: nearest(pr, p) })).filter((x) => x.n.d <= WALK_MAX);
  const nearO = near(o);
  const nearD = near(d);
  const direct = [];
  nearO.forEach((a) => {
    const b = nearD.find((x) => x.pr === a.pr);
    if (!b) return;
    const ride = Math.abs(b.n.pos - a.n.pos);
    if (ride < MIN_RIDE) return;
    direct.push({
      kind: 'direct',
      cost: (a.n.d + b.n.d) / WALK_SPEED + ride / RIDE_SPEED + WAIT_MIN,
      legs: [{ pr: a.pr, from: a.n.pos, to: b.n.pos, board: a.n.point, alight: b.n.point }],
      walkStart: a.n.d, walkMid: 0, walkEnd: b.n.d, midFrom: null, midTo: null,
    });
  });
  const transfers = [];
  nearO.forEach((a) => nearD.forEach((b) => {
    if (a.pr === b.pr) return;
    const t = bestTransfer(a, b);
    if (!t) return;
    transfers.push({
      kind: 'transfer',
      cost: t.cost,
      legs: [
        { pr: a.pr, from: a.n.pos, to: t.posA, board: a.n.point, alight: t.pA },
        { pr: b.pr, from: t.posB, to: b.n.pos, board: t.pB, alight: b.n.point },
      ],
      walkStart: a.n.d, walkMid: t.walk, walkEnd: b.n.d, midFrom: t.pA, midTo: t.pB,
    });
  }));
  direct.sort((x, y) => x.cost - y.cost);
  transfers.sort((x, y) => x.cost - y.cost);
  return [...direct.slice(0, 3), ...transfers.slice(0, 2)].sort((x, y) => x.cost - y.cost);
}

// ---------- text ----------
const round10 = (m) => Math.max(10, Math.round(m / 10) * 10);
const kmText = (m) => `${(m / 1000).toFixed(1)} km`;

function legTitle(l) {
  return `${l.pr.route.label}`;
}

function toward(l) {
  const meta = l.pr.route.meta || {};
  return (l.to >= l.from ? meta.to : meta.from) || 'the end of the line';
}

function rideLine(l) {
  const r = l.pr.route;
  const meta = r.meta || {};
  const what = meta.kind === 'bus' ? (meta.provincial ? 'provincial bus' : 'city bus') : 'jeepney';
  return `Ride ${what} ${r.label} toward ${toward(l)} for about ${kmText(Math.abs(l.to - l.from) * (r.approx ? APPROX_FACTOR : 1))}.`;
}

function nearText(xy, skip) {
  const name = landmarkNear(toLL(xy));
  return name && name !== skip ? ` near ${name}` : '';
}

function stepList(opt, o, d) {
  const out = [];
  const first = opt.legs[0];
  if (opt.walkStart > 50) {
    out.push({ icon: '🚶', text: `Walk about ${round10(opt.walkStart)} m from ${o.label} to the ${legTitle(first)} line${nearText(first.board, o.label)}.` });
  } else {
    out.push({ icon: '🚏', text: `Board ${legTitle(first)} right by ${o.label}.` });
  }
  opt.legs.forEach((l, i) => {
    const bus = l.pr.route.meta && l.pr.route.meta.kind === 'bus';
    out.push({ icon: bus ? '🚌' : '🚐', line: legTitle(l), text: rideLine(l) });
    if (i < opt.legs.length - 1) {
      const next = legTitle(opt.legs[i + 1]);
      out.push({
        icon: '🔁',
        text: opt.walkMid > 50
          ? `Get off${nearText(l.alight)}, walk about ${round10(opt.walkMid)} m and board ${next}.`
          : `Get off${nearText(l.alight)} and board ${next} nearby.`,
      });
    }
  });
  const last = opt.legs[opt.legs.length - 1];
  out.push({
    icon: '📍',
    text: `Get off${nearText(last.alight, d.label)}${opt.walkEnd > 50 ? `, then walk about ${round10(opt.walkEnd)} m to ${d.label}` : ` by ${d.label}`}.`,
  });
  return out;
}

function fareText(legs) {
  const f = totalFare(legs);
  if (f) return `Estimated fare: ${peso(f.regular)} (${peso(f.discounted)} with the ${fares.discount_pct}% discount).`;
  const prov = legs.some((l) => l.pr.route.meta && l.pr.route.meta.provincial);
  return prov ? 'Fare depends on the bus class; see the Fares tab for the LTFRB provincial rates.' : 'Fare: rate not yet verified.';
}

// ---------- map drawing ----------
function planFor(opt, o, d) {
  const startLL = o.latlng;
  const endLL = d.latlng;
  const legs = (opt.legs || []).map((l) => ({
    latlngs: slice(l.pr, l.from, l.to), color: l.pr.route.color, label: `${l.pr.route.label} · ${l.pr.route.sub}`,
  }));
  const walks = [];
  if (opt.kind === 'walk') walks.push([startLL, endLL]);
  if (opt.kind === 'taxi') walks.push([startLL, endLL]);
  if (opt.legs && opt.legs.length) {
    walks.push([startLL, toLL(opt.legs[0].board)]);
    if (opt.midFrom) walks.push([toLL(opt.midFrom), toLL(opt.midTo)]);
    walks.push([toLL(opt.legs[opt.legs.length - 1].alight), endLL]);
  }
  return { legs, walks, from: { latlng: startLL, label: o.label }, to: { latlng: endLL, label: d.label } };
}

function draw(index, collapse) {
  if (!context || !current[index]) return;
  MapView.showPlan(planFor(current[index], context.o, context.d), { collapse });
  document.querySelectorAll('.plan-option').forEach((n, i) => n.classList.toggle('is-shown', i === index));
}

// ---------- result cards ----------
function optionCard(opt, index, o, d) {
  const li = el('li', 'plan-option');
  li.dataset.index = String(index);
  let title;
  let meta;
  let steps;
  let fare = '';
  if (opt.kind === 'walk') {
    title = `Option ${index + 1} · Walk`;
    meta = `About ${kmText(opt.meters)} · about ${Math.round(opt.meters / WALK_SPEED)} min`;
    steps = [{ icon: '🚶', text: `Walk about ${round10(opt.meters)} m from ${o.label} to ${d.label}.` }];
  } else if (opt.kind === 'taxi') {
    title = `Option ${index + 1} · Taxi`;
    meta = `About ${opt.km.toFixed(1)} km by road (estimate)`;
    steps = [{ icon: '🚕', text: `Take a metered taxi from ${o.label} to ${d.label}.` }];
    fare = taxiFareText(opt.km);
  } else {
    title = `Option ${index + 1} · ${opt.legs.map(legTitle).join(' then ')}`;
    const rideM = opt.legs.reduce((s, l) => s + Math.abs(l.to - l.from), 0);
    meta = `About ${Math.round(opt.cost)} min · ${opt.legs.length === 1 ? 'direct' : 'one transfer'} · ${kmText(rideM)} riding`;
    steps = stepList(opt, o, d);
    fare = fareText(opt.legs);
  }
  li.append(el('h4', null, title), el('p', 'plan-meta', meta));
  const ol = el('ol', 'steps');
  steps.forEach((s) => {
    const item = el('li', 'step');
    const icon = el('span', 'mode', s.icon);
    icon.setAttribute('aria-hidden', 'true');
    item.append(icon, document.createTextNode(' '));
    const at = s.line ? s.text.indexOf(s.line) : -1;
    if (at >= 0) {
      item.append(document.createTextNode(s.text.slice(0, at)), el('span', 'pill pill--line', s.line), document.createTextNode(s.text.slice(at + s.line.length)));
    } else {
      item.append(document.createTextNode(s.text));
    }
    ol.append(item);
  });
  li.append(ol);
  if (fare) li.append(el('p', 'plan-meta', fare));
  const btn = el('button', 'btn btn--ghost', 'Show on map');
  btn.type = 'button';
  btn.dataset.show = String(index);
  li.append(btn);
  return li;
}

function taxiFareText(km) {
  if (!fares || fares.taxi.flag_down === null) return 'Taxi fare: rate not yet verified.';
  if (fares.taxi.per_km === null) {
    return `Flag-down ${peso(fares.taxi.flag_down)} (provisional) plus the meter. The per-km meter rate is not yet verified, so no total is shown.`;
  }
  return `Estimated taxi fare: about ${peso(fares.taxi.flag_down + fares.taxi.per_km * km)} (waiting time and traffic not included).`;
}

function message(text) {
  return el('p', null, text);
}

function go() {
  const out = $('#plan-results');
  out.textContent = '';
  const fi = $('#plan-from').value;
  const ti = $('#plan-to').value;
  if (fi === '' || ti === '') {
    out.append(message('Choose both a start and an end.'));
    return;
  }
  if (fi === ti) {
    out.append(message('The start and the end are the same place. Choose two different places.'));
    return;
  }
  try {
    const a = points[Number(fi)];
    const b = points[Number(ti)];
    const o = { label: a.label, latlng: [a.lat, a.lng] };
    const d = { label: b.label, latlng: [b.lat, b.lng] };
    context = { o, d };
    if (MapView.getRoutes().length === 0) {
      out.append(message('Routes are still loading. Try again in a moment.'));
      return;
    }
    const straightM = haversineKm(o.latlng, d.latlng) * 1000;
    const opts = [];
    if (straightM * 1.3 <= SHORT_WALK) opts.push({ kind: 'walk', meters: straightM * 1.3 });
    opts.push(...findRideOptions(toXY(o.latlng), toXY(d.latlng)));
    opts.push({ kind: 'taxi', km: (straightM / 1000) * (fares ? fares.road_factor : 1.3) });
    current = opts;
    const rides = opts.filter((x) => x.kind === 'direct' || x.kind === 'transfer').length;
    out.append(message(rides > 0
      ? `Found ${rides} way${rides === 1 ? '' : 's'} to go from ${o.label} to ${d.label}.`
      : `No direct or one-transfer route in this guide links ${o.label} and ${d.label}. Try a nearby landmark, or a taxi.`));
    const list = el('ul', 'plan-list');
    opts.forEach((opt, i) => list.append(optionCard(opt, i, o, d)));
    out.append(list);
    out.append(el('p', 'plan-note', 'Suggestions use the route lines in this guide (dashed lines are rough estimates). Confirm with the driver or barker. Fares are estimates.'));
    const firstRide = opts.findIndex((x) => x.kind === 'direct' || x.kind === 'transfer');
    draw(firstRide >= 0 ? firstRide : opts.length - 1, false);
  } catch (err) {
    out.append(message('Could not plan this trip. Try different places.'));
  }
}

// ---------- setup ----------
async function loadPoints() {
  const [pl, bus] = await Promise.all([loadPlaces(), loadBus()]);
  const list = [];
  if (pl.ok) pl.data.forEach((p) => list.push({ label: p.name, lat: p.lat, lng: p.lng, group: 'Places' }));
  if (bus.ok) {
    bus.data.terminals.forEach((t) => list.push({ label: t.name, lat: t.lat, lng: t.lng, group: 'Bus terminals' }));
    bus.data.routes.filter((r) => r.category === 'provincial').forEach((r) => {
      const end = r.waypoints[r.waypoints.length - 1];
      if (!list.some((p) => p.label === r.to)) list.push({ label: r.to, lat: end[0], lng: end[1], group: 'Provincial destinations' });
    });
  }
  return list.sort((x, y) => x.label.localeCompare(y.label));
}

function fillSelects() {
  ['#plan-from', '#plan-to'].forEach((sel) => {
    const s = $(sel);
    s.textContent = '';
    const first = el('option', null, points.length ? 'Choose a place' : 'No places available');
    first.value = '';
    s.append(first);
    ['Places', 'Bus terminals', 'Provincial destinations'].forEach((g) => {
      const group = el('optgroup');
      group.label = g;
      points.forEach((p, i) => {
        if (p.group !== g) return;
        const o = el('option', null, p.label);
        o.value = String(i);
        group.append(o);
      });
      if (group.children.length) s.append(group);
    });
  });
}

export async function initPlan() {
  if (!$('#plan-from') || !$('#plan-to') || !$('#plan-go') || !$('#plan-results')) return;
  const [fr, pts] = await Promise.all([faresReady, loadPoints()]);
  fares = fr && fr.ok ? fr.data : null;
  points = pts;
  fillSelects();
  $('#plan-go').addEventListener('click', go);
  $('#plan-swap').addEventListener('click', () => {
    const f = $('#plan-from');
    const t = $('#plan-to');
    const v = f.value;
    f.value = t.value;
    t.value = v;
  });
  $('#plan-results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]');
    if (b) draw(Number(b.dataset.show), true);
  });
}
