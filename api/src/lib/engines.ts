/**
 * Routing engine adapters.
 *
 * Educational purpose: the same /api/route request can be answered by three
 * engines with very different internals:
 *  - memory   : plain Dijkstra/A* over adjacency lists (this repo, readable)
 *  - pgrouting: SQL — the graph lives in PostgreSQL, pgr_dijkstra() runs there
 *  - graphhopper: Contraction Hierarchies — heavy preprocessing, ~1ms queries
 *
 * memory always works. The other two activate when their env vars point at
 * the processing/presenting VM services (see infra/).
 */
import { getGraph, type RouteResult } from "./graph";

export const ENGINE_NAMES = ["memory", "pgrouting", "graphhopper"] as const;
export type EngineName = (typeof ENGINE_NAMES)[number];

export interface EngineInfo {
  name: EngineName;
  available: boolean;
  detail: string;
}

export async function listEngines(): Promise<EngineInfo[]> {
  return [
    { name: "memory", available: true, detail: "In-process Dijkstra/A* over the OSM extract" },
    {
      name: "pgrouting",
      available: Boolean(process.env["PGROUTING_DATABASE_URL"]),
      detail: process.env["PGROUTING_DATABASE_URL"]
        ? "pgr_dijkstra() on the processing VM's PostGIS"
        : "Set PGROUTING_DATABASE_URL to enable (processing VM)",
    },
    {
      name: "graphhopper",
      available: Boolean(process.env["GRAPHHOPPER_URL"]),
      detail: process.env["GRAPHHOPPER_URL"]
        ? "Contraction Hierarchies server"
        : "Set GRAPHHOPPER_URL to enable (presenting VM)",
    },
  ];
}

export async function routeWith(
  engine: EngineName,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  algorithm: "dijkstra" | "astar",
): Promise<RouteResult | null> {
  switch (engine) {
    case "memory":
      return getGraph().route(fromLat, fromLon, toLat, toLon, algorithm);
    case "pgrouting":
      return routePgRouting(fromLat, fromLon, toLat, toLon);
    case "graphhopper":
      return routeGraphHopper(fromLat, fromLon, toLat, toLon);
  }
}

/** pgRouting adapter: expects the ways/ways_vertices_pgr schema created by osm2pgrouting (see etl/). */
async function routePgRouting(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Promise<RouteResult | null> {
  const url = process.env["PGROUTING_DATABASE_URL"];
  if (!url) throw new EngineUnavailableError("pgrouting", "PGROUTING_DATABASE_URL is not set");
  let pg: any;
  try {
    // @ts-expect-error — optional dependency, present in production images only
    pg = await import("pg");
  } catch {
    throw new EngineUnavailableError("pgrouting", "the 'pg' package is not installed");
  }
  const t0 = performance.now();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const nearest = `SELECT id FROM ways_vertices_pgr
       ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326) LIMIT 1`;
    const src = (await client.query(nearest, [fromLon, fromLat])).rows[0]?.id;
    const dst = (await client.query(nearest, [toLon, toLat])).rows[0]?.id;
    if (!src || !dst) return null;
    const res = await client.query(
      `SELECT SUM(r.cost * w.length_m / w.cost) AS meters,
              ST_AsGeoJSON(ST_LineMerge(ST_Union(w.the_geom))) AS geom,
              COUNT(*) AS edges
         FROM pgr_dijkstra(
                'SELECT gid AS id, source, target, cost, reverse_cost FROM ways',
                $1::bigint, $2::bigint) r
         JOIN ways w ON r.edge = w.gid`,
      [src, dst],
    );
    const row = res.rows[0];
    if (!row?.geom) return null;
    const meters = Number(row.meters ?? 0);
    return {
      engine: "pgrouting",
      distanceMeters: Math.round(meters),
      durationSeconds: Math.round(meters / (40_000 / 3600)),
      nodeCount: Number(row.edges),
      visitedCount: -1, // internal to PostgreSQL
      computeMs: Math.round((performance.now() - t0) * 100) / 100,
      geometry: JSON.parse(row.geom),
    };
  } finally {
    await client.end();
  }
}

/** GraphHopper adapter: plain HTTP client for its /route endpoint. */
async function routeGraphHopper(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Promise<RouteResult | null> {
  const base = process.env["GRAPHHOPPER_URL"];
  if (!base) throw new EngineUnavailableError("graphhopper", "GRAPHHOPPER_URL is not set");
  const t0 = performance.now();
  const url = `${base.replace(/\/$/, "")}/route?point=${fromLat},${fromLon}&point=${toLat},${toLon}&profile=car&points_encoded=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new EngineUnavailableError("graphhopper", `upstream returned HTTP ${res.status}`);
  }
  const data: any = await res.json();
  const p = data.paths?.[0];
  if (!p) return null;
  return {
    engine: "graphhopper",
    distanceMeters: Math.round(p.distance),
    durationSeconds: Math.round(p.time / 1000),
    nodeCount: p.points.coordinates.length,
    visitedCount: -1, // internal to GraphHopper (CH search space)
    computeMs: Math.round((performance.now() - t0) * 100) / 100,
    geometry: p.points,
  };
}

export class EngineUnavailableError extends Error {
  constructor(
    public engine: string,
    reason: string,
  ) {
    super(`Engine '${engine}' is unavailable: ${reason}`);
  }
}
