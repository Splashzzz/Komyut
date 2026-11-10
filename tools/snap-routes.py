#!/usr/bin/env python3
"""Snap Komyut route waypoints to real roads and save the result to data/paths.json.

Why: the waypoints in data/*.json are hand-placed estimates, so the lines drawn from them can cut across
buildings or water. This script asks a public OSRM (OpenStreetMap routing) server for the road geometry
that passes through each route's waypoints, simplifies it, and writes data/paths.json. The site then
draws the snapped (solid) line instead of the rough (dashed) one. The website itself stays static: run
this on your own computer, then commit data/paths.json.

Usage (from the repo root, Python 3.8+, no extra packages):
    python tools/snap-routes.py                      # snap every route
    python tools/snap-routes.py --only jeepney:04L bus:MY01
    python tools/snap-routes.py --server https://routing.openstreetmap.de/routed-car

Be polite to the free public servers: this makes one request per route (or per 25 waypoints) with a
pause between requests. Do not run it in a loop.
"""
import argparse
import datetime
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    ("jeepney", "data/jeepney.json", "code"),
    ("jeepney", "data/jeepney-2.json", "code"),
    ("bus", "data/bus.json", "id"),
    ("bus", "data/bus-provincial.json", "id"),
]
CHUNK = 25          # waypoints per request
USER_AGENT = "Komyut-route-snapper/1.0 (+https://github.com/Splashzzz/Komyut)"


def load_routes():
    """Return {key: {"waypoints": [[lat, lng], ...], "provincial": bool}}."""
    found = {}
    for prefix, rel, id_field in SOURCES:
        path = ROOT / rel
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else data.get("routes", [])
        for item in items:
            ident = item.get(id_field)
            wps = item.get("waypoints") or []
            if ident and len(wps) >= 2:
                found[f"{prefix}:{ident}"] = {
                    "waypoints": wps,
                    "provincial": item.get("category") == "provincial",
                }
    return found


def meters(a, b):
    """Approximate distance in metres between two [lat, lng] points."""
    ky = 111320.0
    kx = 111320.0 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * ky)


def length(points):
    return sum(meters(points[i - 1], points[i]) for i in range(1, len(points)))


def simplify(points, tolerance_m):
    """Ramer-Douglas-Peucker simplification (iterative, tolerance in metres)."""
    if len(points) < 3 or tolerance_m <= 0:
        return points
    lat0 = points[0][0]
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 111320.0
    xy = [(p[1] * kx, p[0] * ky) for p in points]

    def dist_to_segment(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == 0 and dy == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        worst, index = 0.0, None
        for i in range(lo + 1, hi):
            d = dist_to_segment(xy[i], xy[lo], xy[hi])
            if d > worst:
                worst, index = d, i
        if index is not None and worst > tolerance_m:
            keep[index] = True
            stack.append((lo, index))
            stack.append((index, hi))
    return [p for p, k in zip(points, keep) if k]


def fetch_route(server, chunk, radius, timeout=60):
    """Ask OSRM for the driving route through `chunk` ([[lat, lng], ...]). Returns [[lat, lng], ...]."""
    coords = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in chunk)
    radiuses = ";".join(str(radius) for _ in chunk)
    query = urllib.parse.urlencode({
        "overview": "full", "geometries": "geojson", "steps": "false",
        "continue_straight": "false", "radiuses": radiuses,
    }, safe=";")
    url = f"{server.rstrip('/')}/route/v1/driving/{coords}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
    if body.get("code") != "Ok" or not body.get("routes"):
        raise RuntimeError(f"routing server said {body.get('code')}: {body.get('message', '')}".strip())
    return [[lat, lng] for lng, lat in body["routes"][0]["geometry"]["coordinates"]]


def snap_route(server, waypoints, radius, pause):
    """Snap one route, splitting long waypoint lists into overlapping chunks."""
    path = []
    start = 0
    while start < len(waypoints) - 1:
        chunk = waypoints[start:start + CHUNK]
        part = fetch_route(server, chunk, radius)
        path.extend(part if not path else part[1:])
        start += CHUNK - 1
        if start < len(waypoints) - 1:
            time.sleep(pause)
    return path


def main():
    parser = argparse.ArgumentParser(description="Snap Komyut routes to roads using an OSRM server.")
    parser.add_argument("--server", default="https://router.project-osrm.org", help="OSRM base URL")
    parser.add_argument("--only", nargs="*", default=None, help="route keys to snap, e.g. jeepney:04L bus:MY01")
    parser.add_argument("--radius", type=int, default=400, help="max metres a waypoint may move to reach a road")
    parser.add_argument("--provincial-radius", type=int, default=2000, help="same, for provincial routes")
    parser.add_argument("--tolerance", type=float, default=4.0, help="simplification tolerance in metres (0 = off)")
    parser.add_argument("--pause", type=float, default=1.5, help="seconds to wait between requests")
    parser.add_argument("--fresh", action="store_true", help="ignore existing data/paths.json")
    args = parser.parse_args()

    routes = load_routes()
    if args.only:
        missing = [k for k in args.only if k not in routes]
        if missing:
            sys.exit(f"Unknown route keys: {', '.join(missing)}\nKnown: {', '.join(sorted(routes))}")
        routes = {k: routes[k] for k in args.only}
    if not routes:
        sys.exit("No routes found. Run this from the repo root.")

    out_path = ROOT / "data" / "paths.json"
    paths = {}
    if out_path.exists() and not args.fresh:
        try:
            paths = json.loads(out_path.read_text(encoding="utf-8")).get("paths", {})
        except (OSError, ValueError):
            paths = {}

    failures = []
    for number, (key, info) in enumerate(sorted(routes.items()), start=1):
        radius = args.provincial_radius if info["provincial"] else args.radius
        print(f"[{number}/{len(routes)}] {key} ({len(info['waypoints'])} waypoints) ...", end=" ", flush=True)
        try:
            path = snap_route(args.server, info["waypoints"], radius, args.pause)
        except (urllib.error.URLError, RuntimeError, ValueError, OSError) as err:
            print(f"FAILED: {err}")
            failures.append(key)
            time.sleep(args.pause)
            continue
        path = simplify(path, args.tolerance)
        rough = length(info["waypoints"])
        snapped = length(path)
        ratio = snapped / rough if rough else 1.0
        flag = "  <-- check: much longer than the rough line" if ratio > 2.2 else ""
        print(f"{len(path)} points, {snapped / 1000:.1f} km (rough line {rough / 1000:.1f} km){flag}")
        paths[key] = [[round(lat, 5), round(lng, 5)] for lat, lng in path]
        time.sleep(args.pause)

    payload = {
        "version": 1,
        "generated": datetime.date.today().isoformat(),
        "server": args.server,
        "paths": dict(sorted(paths.items())),
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"\nWrote {out_path.relative_to(ROOT)} with {len(paths)} snapped routes.")
    if failures:
        print("Failed (they keep the rough dashed line): " + ", ".join(failures))
        print("Try again later, lower --radius, or move that route's waypoints closer to a road.")
        sys.exit(1)


if __name__ == "__main__":
    main()
