import { Router, type IRouter } from "express";
import { getGraph } from "../lib/graph";
import { getCache } from "../lib/cache";
import {
  buildLocationInfo,
  getMapSources,
  verifyWithGoogle,
} from "../lib/geo";
import {
  ENGINE_NAMES,
  EngineUnavailableError,
  listEngines,
  routeWith,
  type EngineName,
} from "../lib/engines";

const router: IRouter = Router();

function parsePoint(raw: unknown): [number, number] | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  const [lat, lon] = parts as [number, number];
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lat, lon];
}

/** Graph stats — nodes/edges/ways loaded from the OSM extract. */
router.get("/graph/stats", (_req, res) => {
  res.json(getGraph().stats());
});

/** Which routing engines are configured (memory always; pgRouting/GraphHopper via env). */
router.get("/engines", async (_req, res) => {
  res.json({ engines: await listEngines() });
});

/** Available map tile layers (OSM, satellite, terrain). No API keys are exposed. */
router.get("/map-sources", (_req, res) => {
  res.json({ sources: getMapSources() });
});

/** Location info for a clicked point: reverse geocoding + external verification links. */
router.get("/location-info", async (req, res) => {
  const p = parsePoint(req.query["point"]);
  if (!p) {
    res.status(400).json({ error: "point=lat,lon is required" });
    return;
  }
  const info = await buildLocationInfo(p[0], p[1]);
  res.json(info);
});

/** Optional cross-check against Google Maps Directions API (requires GOOGLE_MAPS_API_KEY). */
router.get("/verify/google", async (req, res) => {
  const from = parsePoint(req.query["from"]);
  const to = parsePoint(req.query["to"]);
  if (!from || !to) {
    res.status(400).json({ error: "from=lat,lon and to=lat,lon are required" });
    return;
  }
  const result = await verifyWithGoogle(from[0], from[1], to[0], to[1]);
  res.json(result);
});

/** Snap a point to the nearest graph node. */
router.get("/nearest", (req, res) => {
  const p = parsePoint(req.query["point"]);
  if (!p) {
    res.status(400).json({ error: "point=lat,lon is required" });
    return;
  }
  res.json(getGraph().nearestNode(p[0], p[1]));
});

/**
 * GET /api/route?from=lat,lon&to=lat,lon&engine=memory&algorithm=astar
 * Cache-aside: identical requests within 60s are served from cache
 * (`cached: true` in the response).
 */
router.get("/route", async (req, res) => {
  const from = parsePoint(req.query["from"]);
  const to = parsePoint(req.query["to"]);
  if (!from || !to) {
    res.status(400).json({ error: "from=lat,lon and to=lat,lon are required" });
    return;
  }
  const engine = (req.query["engine"] ?? "memory") as EngineName;
  if (!ENGINE_NAMES.includes(engine)) {
    res.status(400).json({ error: `engine must be one of: ${ENGINE_NAMES.join(", ")}` });
    return;
  }
  const algorithm = req.query["algorithm"] === "dijkstra" ? "dijkstra" : "astar";

  const cache = await getCache();
  const key = `route:v1:${engine}:${algorithm}:${from.join(",")}:${to.join(",")}`;
  const hit = await cache.get(key);
  if (hit) {
    res.json({ ...JSON.parse(hit), cached: true, cacheBackend: cache.backend });
    return;
  }

  try {
    const result = await routeWith(engine, from[0], from[1], to[0], to[1], algorithm);
    if (!result) {
      res.status(404).json({ error: "No route found between these points" });
      return;
    }
    await cache.set(key, JSON.stringify(result), 60);
    res.json({ ...result, cached: false, cacheBackend: cache.backend });
  } catch (err) {
    if (err instanceof EngineUnavailableError) {
      res.status(503).json({ error: err.message, engine: err.engine });
      return;
    }
    throw err;
  }
});

export default router;
