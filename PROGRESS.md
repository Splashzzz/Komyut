# PROGRESS

## Done (all phases)
- Phase 1: index.html, css/styles.css, js/app.js, js/map.js (tabs, Leaflet + OSM, layers, route highlight, bottom sheet, dark mode, text fallback)
- Phase 2: data/jeepney.json, js/data.js, js/jeepney.js
- Phase 3: data/bus.json, js/bus.js, map markers for terminals
- Phase 4: data/places.json, data/places-2.json, js/places.js (20 places, commute accordions)
- Phase 5: data/fares.json, js/fares.js (fare table + calculator), footer fare date, fares in popups
- Phase 6: README.md, .github/ISSUE_TEMPLATE/route-fare-correction.yml, About tab, data/jeepney-2.json (04B, 01K), touch-size map controls, dark tiles, rename to Komyut
- Full-file release: all files re-issued in one consistent version (patches merged). Fixes included: 08F waypoints on N. Bacalso Ave, 03Q now "verified", jeepney and bus popups wait for fares
- vercel.json: not needed (static site, output directory ".")

## Deploy gotchas
- File names are case-sensitive on Vercel: js/map.js (not maps.js), js/app.js, css/styles.css
- Folders must be at the repo root: css/, js/, data/, .github/ISSUE_TEMPLATE/

## Next (maintenance)
- Run the README smoke test in a real browser and fix anything it finds
- Verify and expand data in small batches (5-8 entries per write): more jeepney codes from the 2026 guide (06H, 12L, 14D, 10M, 12G, 12I), more places (Lapu-Lapu, Talisay, Mandaue)
- Replace the 8 approximate place pins with sourced coordinates
- Re-check fares when LTFRB announces changes; update `checked_on` and `effective_date` in data/fares.json and the footer "Last updated" date

## Known issues
- Waypoints are hand-placed estimates, not surveyed; 01B, 01K, 04B, 08F, MY02 and MY05 are the roughest
- 8 place pins are approximate and marked unverified: Fuente Osmeña Circle, Cebu Provincial Capitol, Plaza Independencia, Cebu Metropolitan Cathedral, Casa Gorordo Museum, Colon Street, Carbon Market, Tops Lookout
- "verified" = endpoints agree across 2+ independent sources; not an LTFRB check
- `type` defaults to "traditional" where unit type is unconfirmed
- Bus fares use the LTFRB city-bus matrix; MyBus or premium services may differ
- Calculator rounds to the nearest PHP 0.25; set `rounding.mode` to "up" in fares.json to round up
- Places commute steps have est_fare null; use the Fares calculator for estimates
- Loading skeletons are empty list items (screen readers may announce empty items while loading)
- Fort San Pedro was damaged in the 2025 Cebu earthquake; confirm it is open
- CNBT (SM City Cebu parking) is a temporary site; a combined terminal at SRP has been discussed
- Page weight estimated well under 1.5 MB excluding tiles (not measured)
