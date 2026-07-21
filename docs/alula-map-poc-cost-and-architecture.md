# Graph Maps — Educational Architecture (Al Ula, Saudi Arabia)

**Purpose:** An educational project demonstrating how to use mature, industry-standard graph-processing software — the same systems used at scale inside big tech companies — with **map building and routing as the worked example**. Al Ula's road network (~10–30k segments) is the dataset: small enough that every tool runs instantly, real enough that every technique is genuine.

**Principle:** use as many mature graph technologies as reasonably fit, each in the role it plays in production systems, and show how they compose.

---

## 1. Deployment Topology — Two VMs

Provisioned by Terraform + Ansible on Hetzner Cloud (see `infra/`), deployed by GitHub Actions. The split mirrors a classic production separation: an offline **processing** tier that builds and analyzes graphs, and an online **presenting** tier that serves them with low latency.

### 1.1 VM 1 — Graph Processing (`maps-processing`)

Builds, stores, and batch-analyzes the graph. Nothing here is on the request path.

| Software | Category | Role here | Used in industry by |
|---|---|---|---|
| **PostgreSQL + PostGIS + pgRouting** | Relational + spatial + graph SQL | Canonical edge/vertex store; Dijkstra, A*, K-shortest-paths, isochrones in SQL | Ubiquitous (Apple, Instagram, Uber all run Postgres/PostGIS lineage) |
| **Memgraph** (or Neo4j) | Native graph DB, Cypher | Property-graph model of junctions/roads/POIs; overlay graphs; the component registry/meta-graph | Neo4j: NASA, Adobe, eBay; Cypher is the de-facto graph query language (now ISO GQL) |
| **Apache Spark — GraphX / GraphFrames** | Distributed batch graph compute | PageRank on junctions, connected components, betweenness, precomputed POI distance matrices | Spark: Netflix, Uber, Apple; GraphX descends from Google's Pregel model |
| **Apache Kafka** | Distributed event log | Ingests route-request events from the presenting tier; replayable stream feeding analytics and the hot-routes leaderboard | LinkedIn (origin), Netflix, Uber, Airbnb |
| **Apache Airflow** | Workflow orchestration | Schedules the pipeline: OSM download → ETL → graph builds → Spark jobs → cache warm | Airbnb (origin), Google Cloud Composer |
| **osmium / osm2pgrouting / osm2pgsql** | Geo ETL | OSM extract → graph tables | Standard OSM toolchain everywhere OSM is used |
| **Spark (streaming) or Kafka consumers** | Stream processing | Aggregates request events into frequency rankings written to Redis | Same lineage as Flink/Samza-style pipelines at LinkedIn/Uber |

Storage: Postgres data, Memgraph data, Kafka log, nightly `pg_dump` (7-day retention).
Network: ports 5432 (Postgres) and 7687 (Bolt) are firewalled to the presenting VM's IP only; Kafka stays internal.

### 1.2 VM 2 — Graph Presenting (`maps-presenting`)

Everything on the user request path: serve the map, answer routing queries in milliseconds, visualize the graph.

| Software | Category | Role here | Used in industry by |
|---|---|---|---|
| **GraphHopper** | Routing engine (JVM) | Turn-by-turn routing with Contraction Hierarchies — the "preprocess the graph, answer in µs" pattern | Basis of GraphHopper Directions API; CH is the technique behind most planet routers |
| **OSRM** | Routing engine (C++) | Same OSM data, different engine — enables side-by-side engine benchmarking (`?engine=`) | Powered Mapbox Directions; used by Apple Maps-adjacent OSM stacks |
| **Redis** | In-memory data store | Route response cache (TTL), adjacency lists (HASH), most-frequent-routes leaderboard (ZSET), short-link table | Twitter, GitHub, Snapchat, Stack Overflow |
| **JSON Web API** (Node/Express or FastAPI) | Service layer | Single façade over all engines + caches; emits request events to Kafka | — |
| **Elasticsearch / OpenSearch + Photon** | Search & geocoding | Place-name search ("Elephant Rock") → coordinates; fuzzy/geo queries | Elasticsearch: Uber, Netflix, Wikipedia; Photon is komoot's OSM geocoder |
| **MapLibre GL** | Map rendering (WebGL) | Frontend: OSM/satellite layer toggle, route drawing, live "graph view" overlay (nodes sized by PageRank) | Fork of Mapbox GL used by AWS Location, Meta mapping stacks |
| **Caddy** | Reverse proxy | TLS termination (automatic certificates), static frontend serving, routing to services | Modern nginx-class proxy |
| **Prometheus + Grafana** | Observability | Metrics from API/Redis/engines; latency dashboards per engine — measurable proof of CH vs. plain Dijkstra | Prometheus: SoundCloud (origin), CNCF standard; Grafana ubiquitous |

Network: only 22/80/443 public. All services in Docker Compose; the API image is built and pushed to GHCR by CI.

### 1.3 Why this split is the lesson

- **Offline vs. online:** batch graph analytics (Spark, hours-scale) never competes for resources with request serving (Redis/engines, ms-scale) — the fundamental big-tech serving pattern.
- **Precompute → cache → serve:** Spark writes results into Redis; routing engines preprocess into Contraction Hierarchies; the API only ever reads prepared data.
- **Events, not writes:** the presenting tier emits Kafka events instead of writing analytics into the DB on the hot path — the log-centric architecture Kafka was built for.

---

## 2. End-to-End Architecture

```
                          ┌───────────────────────────────┐
                          │          DATA SOURCES         │
                          │ OSM extract (Geofabrik)       │
                          │ Satellite tiles (Esri/S2)     │
                          │ Verification: GMaps/GEarth    │
                          └───────────────┬───────────────┘
  PROCESSING VM                           │  Airflow DAG: download → ETL → build → analyze
 ┌────────────────────────────────────────┼─────────────────────────────────────┐
 │              osmium / osm2pgrouting / osm2pgsql                              │
 │                 ┌────────────────┐    ┌─────────────────┐                    │
 │                 │ PostgreSQL     │    │ Memgraph        │                    │
 │                 │ PostGIS +      │    │ (Cypher/Bolt)   │                    │
 │                 │ pgRouting      │    │ property graph, │                    │
 │                 │ edges/vertices │    │ overlay graphs, │                    │
 │                 │ dijkstra/astar │    │ meta-registry   │                    │
 │                 │ /ksp/isochrone │    └────────┬────────┘                    │
 │                 └───────┬────────┘             │                             │
 │                         │ edge list export     │                             │
 │                 ┌───────▼─────────────────────▼────────┐   ┌──────────────┐  │
 │                 │  Apache Spark GraphX / GraphFrames   │   │ Apache Kafka │  │
 │                 │  PageRank · components · betweenness │◄──┤ route-events │  │
 │                 │  POI distance matrix                 │   │ (from API)   │  │
 │                 └───────────────────┬──────────────────┘   └──────────────┘  │
 └─────────────────────────────────────┼────────────────────────────────────────┘
                     writes results    │    5432 / 7687 firewalled to presenting IP
  PRESENTING VM                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Caddy (TLS) ─► JSON API ──► Redis: route cache (TTL) · adjacency (HASH)     │
 │                    │                 hot-routes (ZSET) · short links         │
 │                    ├──► GraphHopper (Contraction Hierarchies)                │
 │                    ├──► OSRM (C++/MLD)          ── engine comparison         │
 │                    ├──► pgRouting (via processing VM)                        │
 │                    ├──► Elasticsearch/Photon (geocoding)                     │
 │                    └──► Kafka producer (request events → processing VM)      │
 │  Prometheus + Grafana: per-engine latency dashboards                         │
 │  MapLibre GL frontend: layers, routes, graph-view overlay (PageRank sizing)  │
 └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. What Each Technology Teaches

**Memgraph / Neo4j + Cypher — the property-graph model**
- Model: `(:Junction {id, lat, lon})-[:ROAD {length_m, highway, surface, maxspeed}]->(:Junction)`, plus `(:POI)-[:NEAR]->(:Junction)`.
- Example lessons:
  ```cypher
  // Shortest path by weight
  MATCH (a:Junction {id: $from}), (b:Junction {id: $to})
  CALL algo.dijkstra(a, b, 'ROAD', 'length_m') YIELD path, weight
  RETURN path, weight;

  // Variable-length pattern: POIs within 3 hops of Old Town
  MATCH (p:POI {name:'AlUla Old Town'})-[:NEAR]->(:Junction)-[:ROAD*1..3]-(j)
  RETURN DISTINCT j;

  // Degree distribution of the road network
  MATCH (j:Junction) RETURN size((j)--()) AS degree, count(*) ORDER BY degree;
  ```

**pgRouting — graphs inside SQL**
- `osm2pgrouting` produces the canonical `ways` + `ways_vertices_pgr` edge list.
- Lessons: `pgr_dijkstra`, `pgr_astar`, `pgr_ksp` (k-shortest paths), `pgr_drivingDistance` (isochrones) — graph algorithms as relational queries, joinable with any business data.

**GraphHopper & OSRM — preprocessing beats raw algorithms**
- Both consume the same OSM extract; the API exposes `?engine=graphhopper|osrm|pgrouting` so responses and latencies can be compared live in Grafana.
- Lesson: Contraction Hierarchies / Multi-Level Dijkstra turn 100ms graph searches into sub-millisecond lookups — the core trick of every planet-scale router.

**Spark GraphX / GraphFrames — the Pregel model**
- Batch jobs over the exported edge list:
  - **PageRank** → structurally important junctions (rendered larger in the frontend graph overlay).
  - **Connected components** → data-quality check (finds disconnected desert-trail fragments needing satellite verification).
  - **Betweenness** → predicts hot segments, seeding the Redis leaderboard.
  - **POI distance matrix** → O(1) Redis lookups for the ~20 main sites.
- Lesson: vertex-centric distributed graph computation (Google Pregel lineage) — overkill for one city, exactly right for the country/world levels in §5.

**Kafka — the log as the integration backbone**
- The API produces a `route-requested` event per query; consumers on the processing VM aggregate frequencies and write rankings back to Redis.
- Lesson: decouple the hot path from analytics; events are replayable (rebuild the leaderboard from history at any time).

**Airflow — pipelines as DAGs**
- One DAG: `download_osm → osmium_clip → load_pgrouting → load_memgraph → build_graphhopper → build_osrm → spark_analytics → warm_redis`.
- Lesson: dependency-ordered, retryable, observable data pipelines — how map data actually ships in production.

**Redis — cache patterns, each a named lesson**
- Read-through TTL cache (`route:{from}:{to}:{engine}`), precomputed HASH adjacency lists, ZSET leaderboard incremented per request, short-code lookup table for sharing.

**Elasticsearch/Photon — search as a separate concern**
- Geocoding ("Hegra" → coordinates) is a text/geo search problem, not a graph problem; production systems separate it. Photon indexes OSM into Elasticsearch.

**Prometheus + Grafana — measure the claims**
- Per-engine histograms make the CH-vs-Dijkstra story quantitative; cache hit-rate panels prove the Redis layer.

---

## 4. Data Verification Workflow

1. Pull the Al Ula OSM extract; run Spark connected-components to flag orphan segments.
2. Overlay flagged segments on the satellite layer; cross-check against Google Maps / Google Earth (historical imagery for seasonal desert tracks).
3. Corrections go upstream into OSM (JOSM/iD) — keeps the pipeline license-clean — then re-extract via the Airflow DAG.
4. Each verified trail is documented in `data/verification-log.md`.

**Licensing rule:** never trace geometry *from* Google imagery into OSM (Google ToS). Google is for verification only; trace from Esri/Bing (which permit OSM tracing) or open imagery.

---

## 5. Scaling the Same Design — Hierarchical Composition

The city is a **reusable component template**; the same architecture composes recursively: city → corridor → region → country → country digital twin → continent → world.

### 5.1 Component hierarchy

| Level | Component | Graph role | Exposed upward |
|---|---|---|---|
| L0 | **City module** (this project) | Dense local graph | 4–10 border/gateway nodes |
| L1 | **Corridor** (city ↔ city) | Sparse highway edges | Endpoint sets |
| L2 | **Region** | Composition of L0+L1; overlay graph of gateways | Regional gateways |
| L3 | **Country** | Composition of regions | Border crossings |
| L4 | **Country digital twin** | Same template, own infra, federated | Border-node distance tables only |
| L5 | **Continent → World** | Composition of twins | — |

Each component exposes only boundary nodes plus a precomputed internal distance table ("overlay graph") — the Customizable Route Planning (CRP) technique behind planet-scale routers. Al Ula's 30k junctions appear at country level as ~6 gateway nodes.

### 5.2 Topology first, fill later

The full skeleton is created **empty** in the graph DB before any city is built:

```cypher
CREATE (sa:Country {code:'SA', status:'EMPTY'})
CREATE (alula:City {id:'AlUla', status:'EMPTY', centroid: point({latitude:26.61, longitude:37.92})})
CREATE (khaybar:City {id:'Khaybar', status:'EMPTY', centroid: point({latitude:25.70, longitude:39.29})})
CREATE (alula)-[:CORRIDOR {status:'EMPTY', est_km:220}]->(khaybar)
CREATE (sa)-[:CONTAINS]->(alula), (sa)-[:CONTAINS]->(khaybar);
```

Cities fill independently, in any order, through status transitions:

```
EMPTY → OUTLINED (boundary + gateways known) → FILLED (dense graph built) → VERIFIED (satellite-checked)
```

- Routing works from day one: stub edges answer with estimated distances; FILLED components transparently upgrade to real turn-by-turn. The API contract never changes.
- Every build is scoped: `build --scope city:AlUla | group:[AlUla,Khaybar] | region:Madinah-Province | country:SA | corridor:AlUla<->Khaybar`.
- Filling a component patches only its parent overlay; OSM diffs re-trigger ETL only for intersecting components.
- A registry (the Memgraph meta-graph) records each component's scope, boundary hash, content profile, build timestamp, and parent.

### 5.3 Two-phase routing across components

1. Local Dijkstra/A* inside the source module → nearest gateway nodes.
2. Overlay-graph lookup (Cypher or precomputed Redis matrix) across corridors and higher levels.
3. Local Dijkstra inside the destination module.

Latency stays flat as coverage grows — step 2 runs on the sparse overlay, never the dense union.

### 5.4 Where each technology lands at scale

- **pgRouting / GraphHopper / OSRM:** per-city dense graphs (unchanged from L0).
- **Memgraph/Neo4j + Cypher:** overlay graphs and the component registry — small, relationship-rich.
- **Spark GraphX/GraphFrames:** becomes genuinely production-grade — boundary distance tables, partitions, cross-component matrices as distributed jobs (planet OSM ≈ ~3B nodes).
- **Kafka:** the federation bus — twins exchange border-node tables and events, not databases.
- **Redis:** keys namespaced per component (`route:{scope}:{from}:{to}`) so caches shard and invalidate independently.
- **Airflow:** the `rebuild-stale` scheduler over the component registry.

---

## 6. User Interaction Layer — Content as a Graph

User content is itself a graph, anchored to the road network — one modeling language (Cypher) end to end.

### 6.1 Authentication
- Managed auth (Clerk / Auth0 / Supabase Auth); short-lived JWTs resolved by the API to a `(:User)` node.
- Roles: `visitor` (read public), `member` (create/save/share), `editor` (verify trails), `admin`.

### 6.2 Graph-anchored user data

```cypher
(:User)-[:CREATED]->(:Place {name, note})-[:AT]->(:Junction)
(:User)-[:CREATED]->(:Route {engine, geojson_ref})-[:VIA*]->(:Junction)
(:User)-[:CREATED]->(:Trail {surface, verified})-[:USES]->(road edges)
(:User)-[:CREATED]->(:MapLayer {title})-[:CONTAINS]->(:Place|:Route|:Trail)
(:User)-[:FAVORITED|:VISITED {at}]->(:POI|:Place)
```

| Feature | Graph effect |
|---|---|
| Saved routes | `(:Route)` node + cached GeoJSON; feeds the hot-routes leaderboard with real usage |
| Custom places | `(:Place)-[:AT]->(:Junction)` — routable immediately |
| Trail reports | `(:Trail)` in `PROPOSED` state → editor verifies → promoted into the routable graph |
| Check-ins | `(:User)-[:VISITED]->(:POI)` — per-user travel graph |
| Collections | `(:MapLayer)` container node |
| Segment ratings | Aggregated edge properties; optional "scenic" routing profile weight |

Storage split: relationships in Memgraph; geometries/photos in Postgres + object storage (by reference); hot user data in Redis.

### 6.3 Sharing as edges

```cypher
(:User)-[:SHARED {mode:'view'|'edit', at}]->(:MapLayer|:Route|:Place)<-[:WITH]-(:User|:Group)
(:MapLayer {visibility:'private'|'link'|'public'})
```

- Share-by-link short codes (`/s/x7Kq2`) resolved via Redis; "shared with me" is a 1-hop query; access control ("can U see O?") is a short path check, cached per (user, object).
- Public gallery ranked by favorites + views (Redis ZSET).
- User content attaches to EMPTY stub cities too — activity becomes the prioritization signal for which city to fill next.

---

## 7. Repository Layout

```
maps/
├── README.md
├── docs/                      # This document
├── data/                      # OSM extract scripts, verification log
├── etl/                       # osmium / osm2pgrouting / Memgraph loaders
├── pipelines/                 # Airflow DAGs
├── spark/                     # GraphX (Scala) + GraphFrames (PySpark) jobs
├── engines/                   # GraphHopper & OSRM configs
├── db/                        # Postgres/pgRouting schema, Cypher scripts
├── api/                       # JSON Web API + Redis caching + Kafka producer
├── web/                       # MapLibre GL frontend
├── infra/                     # Terraform (Hetzner) + Ansible
└── .github/workflows/         # CI/CD: terraform plan/apply, build → GHCR → deploy
```

## 8. Technical Notes

- **Deliberate redundancy:** four routing paths (Cypher, pgRouting, GraphHopper, OSRM) coexist purely for education and benchmarking — a production system picks one.
- **Kafka/Airflow/Spark on one VM** are single-node deployments of distributed systems — correct APIs and patterns, teaching-scale footprint. The code is unchanged when they move to real clusters.
- **Spark at city scale** fits in laptop memory; frame it as the Pregel-model demonstrator whose payoff arrives at country/world scale (§5).
