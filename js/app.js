// js/app.js — bootstrap, tab navigation, error handling.
import * as MapView from './map.js';

const TABS = {
  map: 'Map', jeepney: 'Jeepney', bus: 'Bus', places: 'Places', fares: 'Fares', about: 'About',
};
const IDS = Object.keys(TABS);
const $ = (sel) => document.querySelector(sel);
const mobileQuery = window.matchMedia('(max-width: 899px)');
let mapStarted = false;
let toastTimer = null;

function showToast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.hidden = false;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

function currentTab() {
  const name = location.hash.replace('#', '');
  return IDS.includes(name) ? name : 'map';
}

function setSheet(expanded) {
  const sheet = $('#sheet');
  const handle = $('#sheet-handle');
  if (!sheet || !handle) return;
  sheet.dataset.state = expanded ? 'expanded' : 'collapsed';
  handle.setAttribute('aria-expanded', String(expanded));
}

function hideSkeleton() {
  const s = $('#map-skeleton');
  if (s) s.hidden = true;
}

function enableFallback() {
  $('#panel-map').classList.add('no-map');
  hideSkeleton();
  $('#map-fallback').hidden = false;
  setSheet(true);
}

function startMap() {
  if (mapStarted) return;
  mapStarted = true;
  if (!MapView.initMap($('#map-canvas'), hideSkeleton)) enableFallback();
}

function showTab(name, moveFocus) {
  IDS.forEach((id) => {
    const panel = $(`#panel-${id}`);
    const link = $(`#tab-${id}`);
    if (panel) panel.hidden = id !== name;
    if (link) {
      if (id === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  });
  document.title = `${TABS[name]} · Komyut – Metro Cebu commuter guide`;
  if (name === 'map') {
    startMap();
    MapView.invalidate();
  }
  if (moveFocus) {
    const heading = $(`#h-${name}`);
    if (heading) heading.focus();
  }
}

function wireControls() {
  MapView.bindList($('#route-list'));
  $('#search').addEventListener('input', (e) => MapView.setQuery(e.target.value));
  document.querySelectorAll('input[data-layer]').forEach((box) => {
    box.addEventListener('change', () => MapView.setLayerVisible(box.dataset.layer, box.checked));
  });
  const clearBtn = $('#clear-selection');
  clearBtn.addEventListener('click', () => MapView.clearSelection());
  $('#sheet-handle').addEventListener('click', () => setSheet($('#sheet').dataset.state !== 'expanded'));
  document.addEventListener('route:selected', () => {
    clearBtn.disabled = false;
    const wasOpen = $('#sheet').dataset.state === 'expanded';
    if (mobileQuery.matches && wasOpen && !$('#panel-map').classList.contains('no-map')) {
      setSheet(false);
      $('#sheet-handle').focus();
    }
  });
  document.addEventListener('route:cleared', () => { clearBtn.disabled = true; });
}

function init() {
  wireControls();
  window.addEventListener('hashchange', () => showTab(currentTab(), true));
  showTab(currentTab(), false);
  import('./jeepney.js')
    .then((m) => m.initJeepney())
    .catch(() => showToast('The Jeepney tab could not start. Other tabs still work.'));
  import('./bus.js')
    .then((m) => m.initBus())
    .catch(() => showToast('The Bus tab could not start. Other tabs still work.'));
  import('./places.js')
    .then((m) => m.initPlaces())
    .catch(() => showToast('The Places tab could not start. Other tabs still work.'));
  import('./fares.js')
    .then((m) => m.initFares())
    .catch(() => showToast('The Fares tab could not start. Other tabs still work.'));
}

window.addEventListener('error', () => showToast('Something went wrong. Other tabs still work.'));
window.addEventListener('unhandledrejection', () => showToast('Something went wrong. Other tabs still work.'));

try {
  init();
} catch (err) {
  showToast('Could not start the app. Try reloading.');
}
