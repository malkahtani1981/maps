# maps-api — the routing lab

Express + TypeScript API and MapLibre frontend. Three interchangeable routing
engines behind one endpoint (see `src/lib/engines.ts`):

| engine | how it works | enable with |
|---|---|---|
| `memory` | Dijkstra / A* over adjacency lists built from the OSM extract (`src/lib/graph.ts`) | always on |
| `pgrouting` | `pgr_dijkstra()` in PostGIS on the processing VM | `PGROUTING_DATABASE_URL` |
| `graphhopper` | Contraction Hierarchies server | `GRAPHHOPPER_URL` |

Route responses are cached (cache-aside, 60s TTL) in Redis when `REDIS_URL`
is set, in-process otherwise (`src/lib/cache.ts`).

## Run locally

```bash
node ../etl/fetch-osm.mjs   # once, if data/alula-roads.json is missing
npm install
npm run dev                 # http://localhost:8080  (UI + /api/*)
```

## Endpoints

Routing & graph:

- `GET /api/route?from=lat,lon&to=lat,lon&engine=memory&algorithm=astar|dijkstra`
- `GET /api/nearest?point=lat,lon`
- `GET /api/graph/stats`
- `GET /api/engines`

Map & verification:

- `GET /api/map-sources` — tile layers available to the frontend (OSM, satellite, terrain)
- `GET /api/location-info?point=lat,lon` — reverse geocoding + OpenStreetMap/Google Maps/Google Earth links
- `GET /api/verify/google?from=lat,lon&to=lat,lon` — optional Google Maps Directions comparison (requires `GOOGLE_MAPS_API_KEY`)

- `GET /api/healthz`

## Map sources & verification

The frontend ships with three interchangeable raster basemaps:

- **OpenStreetMap** — default
- **Satellite (ESRI World Imagery)** — no API key required
- **Terrain (OpenTopoMap)** — no API key required

Clicking the map fetches a reverse-geocoded address from Nominatim and shows
links to view the same point in **OpenStreetMap**, **Google Maps**, and
**Google Earth**.

For an optional Google Maps Directions API cross-check, set the environment
variable `GOOGLE_MAPS_API_KEY` and call `GET /api/verify/google`. The endpoint
returns the distance and duration Google computes for the same `from`/`to`
points, so you can compare it with the in-memory / pgRouting / GraphHopper
results.

Try the same request with `algorithm=dijkstra` vs `astar` and compare
`visitedCount` — that difference is the whole point of the heuristic.
