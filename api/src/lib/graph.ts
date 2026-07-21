/**
 * In-memory road graph built from an OSM Overpass extract.
 *
 * Educational purpose: this is the "no infrastructure" routing engine —
 * the same graph model that pgRouting builds in SQL and GraphHopper builds
 * with Contraction Hierarchies, expressed as plain adjacency lists so you
 * can read every step. Dijkstra and A* are implemented directly.
 */
import fs from "node:fs";
import path from "node:path";

export interface GraphNode {
  id: number;
  lat: number;
  lon: number;
}

interface Edge {
  to: number; // index into nodes array
  weight: number; // meters
  wayId: number;
}

export interface RouteResult {
  engine: string;
  distanceMeters: number;
  durationSeconds: number; // naive 40 km/h average
  nodeCount: number;
  visitedCount: number; // how many nodes the search explored (educational)
  computeMs: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

const EARTH_R = 6371000;
export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

/** Simple binary min-heap keyed on number priority. */
class MinHeap {
  private items: number[] = []; // node indices
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.prio[l]! < this.prio[smallest]!) smallest = l;
        if (r < this.items.length && this.prio[r]! < this.prio[smallest]!) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

export class RoadGraph {
  nodes: GraphNode[] = [];
  private adj: Edge[][] = [];
  private idToIndex = new Map<number, number>();
  wayCount = 0;
  edgeCount = 0;
  source = "";

  static fromOverpassFile(filePath: string): RoadGraph {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const g = new RoadGraph();
    g.source = path.basename(filePath);
    const elements: any[] = raw.elements ?? [];

    for (const el of elements) {
      if (el.type === "node") {
        g.idToIndex.set(el.id, g.nodes.length);
        g.nodes.push({ id: el.id, lat: el.lat, lon: el.lon });
      }
    }
    g.adj = g.nodes.map(() => []);

    for (const el of elements) {
      if (el.type !== "way" || !Array.isArray(el.nodes)) continue;
      g.wayCount++;
      const oneway = el.tags?.oneway === "yes" || el.tags?.junction === "roundabout";
      for (let i = 0; i + 1 < el.nodes.length; i++) {
        const a = g.idToIndex.get(el.nodes[i]);
        const b = g.idToIndex.get(el.nodes[i + 1]);
        if (a === undefined || b === undefined) continue;
        const na = g.nodes[a]!;
        const nb = g.nodes[b]!;
        const w = haversine(na.lat, na.lon, nb.lat, nb.lon);
        g.adj[a]!.push({ to: b, weight: w, wayId: el.id });
        g.edgeCount++;
        if (!oneway) {
          g.adj[b]!.push({ to: a, weight: w, wayId: el.id });
          g.edgeCount++;
        }
      }
    }
    return g;
  }

  nearestNode(lat: number, lon: number): GraphNode {
    // Linear scan is fine at this scale (~8k nodes). pgRouting/GraphHopper
    // use spatial indexes (GiST / KD-trees) for the same operation.
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      const d = haversine(lat, lon, n.lat, n.lon);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return this.nodes[best]!;
  }

  /**
   * Shortest path. algorithm = "dijkstra" explores uniformly;
   * "astar" adds a straight-line-distance heuristic and explores fewer nodes —
   * compare `visitedCount` in the response to see the difference.
   */
  route(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    algorithm: "dijkstra" | "astar" = "astar",
  ): RouteResult | null {
    const t0 = performance.now();
    const start = this.idToIndex.get(this.nearestNode(fromLat, fromLon).id)!;
    const goal = this.idToIndex.get(this.nearestNode(toLat, toLon).id)!;
    const goalNode = this.nodes[goal]!;

    const dist = new Float64Array(this.nodes.length).fill(Infinity);
    const prev = new Int32Array(this.nodes.length).fill(-1);
    const done = new Uint8Array(this.nodes.length);
    dist[start] = 0;
    const heap = new MinHeap();
    heap.push(start, 0);
    let visited = 0;

    while (heap.size > 0) {
      const u = heap.pop()!;
      if (done[u]) continue;
      done[u] = 1;
      visited++;
      if (u === goal) break;
      for (const e of this.adj[u]!) {
        const nd = dist[u]! + e.weight;
        if (nd < dist[e.to]!) {
          dist[e.to] = nd;
          prev[e.to] = u;
          const n = this.nodes[e.to]!;
          const h =
            algorithm === "astar" ? haversine(n.lat, n.lon, goalNode.lat, goalNode.lon) : 0;
          heap.push(e.to, nd + h);
        }
      }
    }

    if (!Number.isFinite(dist[goal]!)) return null;

    const coords: [number, number][] = [];
    for (let cur = goal; cur !== -1; cur = prev[cur]!) {
      const n = this.nodes[cur]!;
      coords.push([n.lon, n.lat]);
    }
    coords.reverse();

    const meters = dist[goal]!;
    return {
      engine: `memory-${algorithm}`,
      distanceMeters: Math.round(meters),
      durationSeconds: Math.round(meters / (40_000 / 3600)),
      nodeCount: coords.length,
      visitedCount: visited,
      computeMs: Math.round((performance.now() - t0) * 100) / 100,
      geometry: { type: "LineString", coordinates: coords },
    };
  }

  stats() {
    return {
      source: this.source,
      nodes: this.nodes.length,
      directedEdges: this.edgeCount,
      ways: this.wayCount,
    };
  }
}

let graph: RoadGraph | null = null;

export function getGraph(): RoadGraph {
  if (graph) return graph;
  const candidates = [
    process.env["OSM_DATA_FILE"],
    path.resolve(process.cwd(), "../../data/alula-roads.json"), // monorepo dev
    path.resolve(process.cwd(), "../data/alula-roads.json"), // standalone repo (api/)
    path.resolve(process.cwd(), "data/alula-roads.json"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      graph = RoadGraph.fromOverpassFile(c);
      return graph;
    }
  }
  throw new Error(
    `OSM data file not found. Set OSM_DATA_FILE or run etl/fetch-osm.mjs. Tried: ${candidates.join(", ")}`,
  );
}
