# ETL — building the graph from OpenStreetMap

Pipeline (each step is one lesson; Airflow orchestrates them on the processing VM):

```
Overpass API ──> data/alula-roads.json ──> in-memory engine (api/)
                        │
                        ├─ export-edges.mjs ──> edges.csv / nodes.csv
                        │        ├──> Memgraph  (load-memgraph.cypher — Cypher)
                        │        └──> Spark     (spark-jobs/ — GraphFrames)
                        │
osm.pbf extract ──> osm2pgrouting ──> PostgreSQL ways/ways_vertices_pgr (pgRouting)
                └─> GraphHopper import (Contraction Hierarchies)
```

## 1. Fetch OSM roads (Overpass)

```bash
node etl/fetch-osm.mjs                      # Al Ula default bbox
node etl/fetch-osm.mjs 24.5 46.4 25.0 47.0  # any bbox: south west north east
```

## 2. Export CSVs for Memgraph & Spark

```bash
node etl/export-edges.mjs
```

## 3. pgRouting (processing VM)

Uses a proper `.osm.pbf` extract (better fidelity than Overpass JSON):

```bash
# on the processing VM
wget https://download.geofabrik.de/asia/saudi-arabia-latest.osm.pbf
osmium extract -b 37.85,26.55,38.05,26.72 saudi-arabia-latest.osm.pbf -o alula.osm.pbf
osmium cat alula.osm.pbf -o alula.osm      # osm2pgrouting wants XML
osm2pgrouting --f alula.osm --conf /usr/share/osm2pgrouting/mapconfig_for_cars.xml \
  --dbname maps --username maps --clean
```

This creates the `ways` / `ways_vertices_pgr` tables the API's pgrouting
engine queries (`PGROUTING_DATABASE_URL`).

## 4. Memgraph (processing VM)

```bash
docker cp data/. maps-memgraph:/data
docker exec -i maps-memgraph mgconsole < etl/load-memgraph.cypher
```

## 5. GraphHopper (presenting VM)

The compose file mounts `alula.osm.pbf` and GraphHopper builds its
Contraction Hierarchies on first start — see infra/ansible/roles/presenting_stack.
