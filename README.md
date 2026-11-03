# Komyut

A free, static, mobile-first commuter guide for Metro Cebu, Philippines. It shows jeepney codes and routes, bus terminals and routes, popular places with step-by-step *sakay* directions, and fare estimates on an interactive map centered on Cebu City.

No paid APIs, no API keys, no backend, no database, no login. Plain HTML, CSS and vanilla JavaScript (ES modules). Map: [Leaflet](https://leafletjs.com) 1.9.4 from cdnjs with OpenStreetMap tiles.

> Routes are approximate. Confirm with the driver or barker. Fares are estimates; the fare guide posted inside the vehicle settles any difference.

## Features

- **Map:** layer toggles (Jeepney, Bus, Terminals, Places), route highlight with fade, popups, search by code, destination or landmark.
- **Jeepney / Bus tabs:** searchable cards, traditional/modern filter, "Show on map".
- **Places tab:** 20 destinations with category filter and commute steps per starting point.
- **Fares tab:** fare table, discount info, calculator (regular or 20% discounted).
- Dark mode via `prefers-color-scheme`, system font stack, keyboard accessible, works on slow 4G.

## Run locally

ES modules need HTTP (they do not run from `file://`):

```
python -m http.server 8000
```

Open http://localhost:8000.

## Deploy (GitHub + Vercel)

1. Create a GitHub repo and push all files (the repo root is the site root).
2. In Vercel: **Add New Project** → import the repo → Framework Preset **Other** → no build command → output directory **.** → **Deploy**.
3. Every `git push` to `main` redeploys automatically.
4. Optional: keep `.github/ISSUE_TEMPLATE/route-fare-correction.yml` so people can file "Route/Fare correction" issues.

`vercel.json` is not needed.

## Project structure

```
index.html            app shell (tabs: Map | Jeepney | Bus | Places | Fares | About)
css/styles.css
js/app.js             bootstrap, tab navigation, error handling
js/map.js             Leaflet init, layers, markers, highlight/clear route
js/data.js            fetch + validate JSON, with fallbacks; fares loader
js/jeepney.js         Jeepney tab
js/bus.js             Bus tab
js/places.js          Places tab
js/fares.js           Fares tab + calculator
data/jeepney.json     jeepney routes (data/jeepney-2.json holds more)
data/bus.json         terminals + routes
data/places.json      places (data/places-2.json holds more)
data/fares.json       fare rules
```

Every tab fails on its own: if a JSON file is missing or invalid, that tab shows a friendly message and the others keep working. If Leaflet fails to load, the map tab shows a text-only route list.

## Data schemas

All data lives in `/data`. Never hardcode data in JS.

**jeepney.json** (array; `jeepney-2.json` has the same shape)

```json
{ "code": "04L", "name": "Lahug – SM City Cebu", "type": "traditional|modern",
  "from": "", "to": "", "via": [""], "waypoints": [[10.32, 123.89]],
  "color": "#c2185b", "operating_hours": "", "confidence": "verified|community|unverified", "notes": "" }
```

**bus.json**

```json
{ "terminals": [{ "id": "csbt", "name": "", "lat": 0, "lng": 0, "address": "",
                  "operators": [""], "destinations": [""], "confidence": "", "notes": "" }],
  "routes": [{ "id": "MY01", "operator": "", "from": "", "to": "", "via": [""],
               "waypoints": [[0, 0]], "bus_type": "ordinary|aircon",
               "est_duration_min": null, "color": "#37474f", "confidence": "", "notes": "" }] }
```

**places.json** (array; `places-2.json` has the same shape)

```json
{ "id": "", "name": "", "category": "mall|park|theme_park|historic|religious|market|beach|other",
  "city": "Cebu City|Mandaue|Lapu-Lapu|Talisay|Consolacion|Liloan|Minglanilla|Naga",
  "lat": 0, "lng": 0, "description": "", "entrance_fee": "", "hours": "",
  "how_to_commute": [{ "from": "", "steps": [
    { "mode": "jeepney|bus|taxi|walk|tricycle|habal-habal|ferry", "line": "04L", "instruction": "", "est_fare": null } ] }],
  "confidence": "", "notes": "" }
```

**fares.json**

```json
{ "effective_date": "2026-09-28", "source_note": "", "checked_on": "",
  "jeepney_traditional": { "min_fare": 14, "min_km": 4, "per_km": 2 },
  "jeepney_modern": { "min_fare": 17, "min_km": 4, "per_km": 2.4 },
  "discount_pct": 20, "discount_applies_to": [""],
  "bus": { "ordinary": { "min_fare": 15, "min_km": 5, "per_km": 2.49 },
           "aircon": { "min_fare": 18, "min_km": 5, "per_km": 2.98 } },
  "rounding": { "step": 0.25, "mode": "nearest|up", "note": "" },
  "distance_estimate": { "road_factor": 1.3 },
  "bus_note": "", "taxi_note": "", "tricycle_note": "", "habal_note": "" }
```

Fare rule: `fare = min_fare` if distance ≤ `min_km`, otherwise `min_fare + ceil(distance − min_km) × per_km`; then the discount (if chosen); then rounding. Distance is a straight-line (Haversine) estimate × `road_factor`, labelled as an estimate in the UI. A rate set to `null` shows "Rate not yet verified".

## Confidence levels

| Level | Meaning | UI badge |
|---|---|---|
| `verified` | Endpoints agree across two or more independent sources. Not an official LTFRB check. | Verified (multiple sources) |
| `community` | One source, or details partly inferred. | Community-reported |
| `unverified` | Location or route needs confirmation, or the pin is approximate. | Unverified – help us confirm |

Invalid or missing confidence values are shown as `unverified`. Waypoints are hand-placed estimates, not surveyed.

## Contributing

Do not invent codes, routes or fares. If unsure, use `"confidence": "unverified"` and say why in `notes`.

- **Report a problem:** open a ["Route/Fare correction" issue](https://github.com/Splashzzz/Komyut/issues/new?template=route-fare-correction.yml) with a source or the date you rode it.
- **Add data:** open a pull request that edits files in `/data` in small batches (5–8 entries). Check JSON before pushing:

```
for f in data/*.json; do python -m json.tool "$f" > /dev/null && echo "ok $f"; done
```

- Keep each file under about 300 lines; split data into `-2`, `-3` files instead (the loaders in `js/data.js` list the files).

## Smoke test before each deploy

1. Serve locally and open DevTools: no errors in the console on load.
2. Visit every tab; each shows data or a friendly message.
3. Map: tap a route chip (line highlights, popup opens), then **Clear selection**; toggle each layer.
4. Places: open a "How to get there" accordion; **Show on map** jumps to the pin.
5. Fares: pick two places and check the estimate; switch to Discounted.
6. Rename a data file temporarily: only that tab should show an error message.
7. Resize to a phone width: bottom tab bar and bottom sheet work; 44 px tap targets.

## Credits

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Map library: [Leaflet](https://leafletjs.com) (BSD-2-Clause). Route and place information is compiled from public sources listed on the About tab. Add a `LICENSE` file for the code and data of your choice.

OpenStreetMap's public tile servers are meant for light use. If traffic grows, switch to a tile provider whose terms allow it.
