#!/usr/bin/env node
/**
 * Fetch the road network for a bounding box from the Overpass API and save it
 * as data/alula-roads.json (the input for the in-memory routing engine).
 *
 * Usage:
 *   node etl/fetch-osm.mjs                     # default: Al Ula, Saudi Arabia
 *   node etl/fetch-osm.mjs 26.55 37.85 26.72 38.05   # south west north east
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [south = "26.55", west = "37.85", north = "26.72", east = "38.05"] =
  process.argv.slice(2);

const HIGHWAY_CLASSES =
  "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link";

const query = `[out:json][timeout:90];
(way["highway"~"^(${HIGHWAY_CLASSES})$"](${south},${west},${north},${east}););
out body;>;out skel qt;`;

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "maps-edu-poc/1.0",
  },
  body: "data=" + encodeURIComponent(query),
});
if (!res.ok) {
  console.error(`Overpass returned HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();
const data = JSON.parse(text); // fail loudly on non-JSON (rate limiting etc.)

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "alula-roads.json");
fs.writeFileSync(outFile, text);

const ways = data.elements.filter((e) => e.type === "way").length;
const nodes = data.elements.filter((e) => e.type === "node").length;
console.log(`Wrote ${outFile}: ${ways} ways, ${nodes} nodes (${text.length} bytes)`);
