#!/usr/bin/env node
/**
 * Export the road graph as edge/vertex CSVs for Spark GraphFrames and for
 * Cypher LOAD CSV into Memgraph/Neo4j.
 *
 * Reads data/alula-roads.json (run etl/fetch-osm.mjs first), writes:
 *   data/edges.csv    src,dst,length_m,way_id
 *   data/nodes.csv    id,lat,lon
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "alula-roads.json"), "utf8"));

const nodes = new Map();
for (const el of raw.elements) if (el.type === "node") nodes.set(el.id, el);

const R = 6371000;
const hav = (a, b) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const edgeLines = ["src,dst,length_m,way_id"];
for (const el of raw.elements) {
  if (el.type !== "way" || !Array.isArray(el.nodes)) continue;
  const oneway = el.tags?.oneway === "yes" || el.tags?.junction === "roundabout";
  for (let i = 0; i + 1 < el.nodes.length; i++) {
    const a = nodes.get(el.nodes[i]);
    const b = nodes.get(el.nodes[i + 1]);
    if (!a || !b) continue;
    const w = hav(a, b).toFixed(1);
    edgeLines.push(`${a.id},${b.id},${w},${el.id}`);
    if (!oneway) edgeLines.push(`${b.id},${a.id},${w},${el.id}`);
  }
}
const nodeLines = ["id,lat,lon"];
for (const n of nodes.values()) nodeLines.push(`${n.id},${n.lat},${n.lon}`);

fs.writeFileSync(path.join(dataDir, "edges.csv"), edgeLines.join("\n"));
fs.writeFileSync(path.join(dataDir, "nodes.csv"), nodeLines.join("\n"));
console.log(`Wrote ${nodeLines.length - 1} nodes, ${edgeLines.length - 1} directed edges`);
