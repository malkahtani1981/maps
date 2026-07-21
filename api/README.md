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

- `GET /api/route?from=lat,lon&to=lat,lon&engine=memory&algorithm=astar|dijkstra`
- `GET /api/nearest?point=lat,lon`
- `GET /api/graph/stats`
- `GET /api/engines`
- `GET /api/healthz`

Try the same request with `algorithm=dijkstra` vs `astar` and compare
`visitedCount` — that difference is the whole point of the heuristic.
