# PROGRESS

## Done
- Phase 1: index.html, css/styles.css, js/app.js, js/map.js
  - Tabs (hash routing), Leaflet 1.9.4 + OSM tiles, Metro Cebu bounds, layer toggles
  - Route highlight/clear API, sidebar list + search, mobile bottom sheet
  - Dark mode CSS variables, text-only fallback if Leaflet fails

## Next
- Phase 2: data/jeepney.json (5 routes), js/data.js, Jeepney tab, route highlighting
  - Feed the map with `MapView.addRoutes([{ id, label, sub, search, layer: 'jeepney', color, latlngs, popupHtml }])`
  - Build `popupHtml` with `escapeHtml` (exported from js/map.js)

## Known issues
- Terminals and Places layers are empty until Phases 3-4 (no `addMarker` yet)
- Footer `#fare-date` shows "not loaded yet" until Phase 5
- About tab: data sources and GitHub Issues link pending (Phase 6)
- Jeepney/Bus/Places/Fares tabs show "Coming soon"