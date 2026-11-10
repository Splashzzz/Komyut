# PROGRESS

## Done
- Phases 1-6: map, tabs, jeepney, bus, places, fares, About, README, issue template
- Update 2 (this release, one consistent set of files):
  - Fixed: sidebar route list did not scroll on desktop (grid row had no height limit), so routes were cut off. Routes are now grouped (Jeepney / City bus / Provincial bus) with counts
  - Fixed: Clear selection now clears routes, pin popups and trip plans, and is enabled whenever any of those is showing
  - Route lines: dashed = rough hand-placed estimate, solid = snapped to roads. `tools/snap-routes.py` writes `data/paths.json` (run it on your own computer); the site prefers snapped paths
  - New: Plan a trip (js/plan.js): walking, direct, one-transfer and taxi options with steps, fare estimates and map drawing
  - New: provincial bus routes from CSBT (Carcar, Argao, Oslob, Moalboal) and CNBT (Danao, Bogo, Hagnaya Port, Maya Port) in data/bus-provincial.json; Provincial bus layer (off by default); map now covers the whole island (zoom out to see them)
  - New: taxi in the fare calculator and table (flag-down 65 provisional; per-km not verified, so the user can enter a meter rate), plus ordinary provincial bus rate and class notes
- Tested in headless Chromium (desktop and phone sizes): 71 checks on tabs, sidebar scrolling, selection/clear, planner, provincial layer, fares and taxi, console errors; plus snapped-path rendering, no-Leaflet fallback and missing-data fallback; the snapping script was tested against a local mock routing server

## Next
- Run `python tools/snap-routes.py` on your computer, review lines flagged `<-- check`, commit data/paths.json
- Verify provincial routes (via towns, operators, bus classes, travel times) and add routes from other towns (Toledo, Bato/Samboan, Tuburan, Camotes)
- Replace the 8 approximate place pins with sourced coordinates
- Verify the regular-taxi per-km and waiting-time meter rates, then fill `taxi.per_km` in data/fares.json
- Re-check fares when LTFRB announces changes; update `checked_on` and `effective_date`, and the footer "Last updated" date

## Known issues
- Until paths.json is generated, all route lines are rough estimates (dashed), so the trip planner's suggestions are approximate; the MyBus and provincial lines are the roughest
- Provincial routes are community-reported: destinations come from travel guides, via towns are inferred from the highways, operators and bus classes vary, fares depend on bus class (only ordinary has a verified rate)
- The planner does not know stop locations or one-way streets, handles at most one transfer, and does not use time-of-day schedules
- 8 place pins are approximate and marked unverified: Fuente Osmeña Circle, Cebu Provincial Capitol, Plaza Independencia, Cebu Metropolitan Cathedral, Casa Gorordo Museum, Colon Street, Carbon Market, Tops Lookout
- "verified" = endpoints agree across 2+ independent sources; not an LTFRB check
- `type` defaults to "traditional" where unit type is unconfirmed
- Bus fares use the LTFRB city-bus matrix; MyBus or premium services may differ
- Calculator rounds to the nearest PHP 0.25; set `rounding.mode` to "up" in fares.json to round up
- Places commute steps have est_fare null; use the Fares calculator or the trip planner for estimates
- Loading skeletons are empty list items (screen readers may announce empty items while loading)
- Fort San Pedro was damaged in the 2025 Cebu earthquake; confirm it is open
- CNBT (SM City Cebu parking) is a temporary site; a combined terminal at SRP has been discussed
- OSM public tile servers are for light use
