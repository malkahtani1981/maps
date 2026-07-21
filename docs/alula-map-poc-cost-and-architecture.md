# Al Ula Map PoC — Cost Estimate & Architecture

**Project:** Small-city interactive map & routing proof-of-concept for Al Ula, Saudi Arabia
**Goal:** Demonstrate graph processing end-to-end — graph databases, Cypher, routing engines, distributed graph precomputation, and cached graph APIs — hosted on GitHub.
**Date:** July 2026

---

## 1. Total Cost Estimate

### 1.1 Software, data & services (PoC phase)

| Component | Role | PoC Cost | Notes |
|---|---|---|---|
| OpenStreetMap (data + tiles) | Base street map, road network source | **$0** | ODbL license. Al Ula extract via Geofabrik/Overpass is a few MB. |
| Satellite imagery (Esri World Imagery, Sentinel-2) | Desert roads & trails layer | **$0** | Free for light/non-commercial tile use; Sentinel-2 fully open. |
| Google Maps | Manual verification of road geometry | **$0** | Manual cross-checks cost nothing. Automated API use has ~10k free calls/mo per SKU. |
| Google Earth (Pro) | Historical imagery, trail verification | **$0** | Free desktop app. |
| Neo4j Aura Free **or** Memgraph Community | Graph DB, Cypher queries | **$0** | Aura Free: 200k nodes / 400k rels — Al Ula's road graph (~10–30k edges) fits easily. Memgraph Community is free self-hosted. |
| GraphHopper (self-hosted, OSS) | Turn-by-turn routing engine | **$0** | Apache 2.0. Runs on a small JVM; Al Ula graph builds in seconds. |
| OSRM | High-performance routing (C++) | **$0** | BSD license. |
| PostgreSQL + pgRouting | SQL-side graph routing (Dijkstra, A*, KSP) | **$0** | Fully open source. |
| Apache Spark GraphX / GraphFrames | Batch graph precomputation | **$0** | Local mode on a laptop is plenty for a small city. |
| Redis | Cache: hot routes, adjacency lists | **$0** | Redis Cloud free tier (30 MB) or local instance. |
| GitHub | Repo, CI (Actions), Pages for demo | **$0** | Free tier includes 2,000 CI minutes/mo. |

**PoC software/data subtotal: $0**

### 1.2 Hosting (only if deployed beyond a local demo)

| Option | Monthly cost | Fits |
|---|---|---|
| GitHub Pages (static frontend) + free-tier backends (Aura Free, Redis Cloud free) | **$0** | Demo-grade PoC |
| Single small VPS (2 vCPU / 4 GB — Hetzner, DigitalOcean, etc.) running Postgres+pgRouting, GraphHopper, Redis, Memgraph | **$6–25/mo** | Full self-hosted stack |
| Replit / Render / Fly.io small deployment | **$7–25/mo** | Managed alternative |
| Managed everything (Aura Pro + Redis Cloud paid + VPS for routing) | **$70–150/mo** | Only needed at production scale — overkill for a PoC |

**Note:** Spark is a *batch* job, not a live service — run it locally or in free GitHub Actions CI; it never needs to be hosted.

### 1.2b Production hosting estimate (GitHub + low-cost VMs)

Target: a **production-grade** deployment (real users, login, user content, sharing) built on GitHub + budget VMs (Hetzner/Contabo/OVH class pricing; DigitalOcean/Linode run ~1.5–2× these numbers). Two realistic tiers:

**Tier A — Lean production, single city → small group of cities (recommended start)**

| Item | Spec | Monthly |
|---|---|---|
| App VM #1 | 4 vCPU / 8 GB / 160 GB NVMe — API, Redis, GraphHopper *or* OSRM | $8–15 |
| Data VM #2 | 4 vCPU / 8 GB — PostgreSQL + pgRouting, Memgraph Community | $8–15 |
| Automated VM snapshots/backups | daily, 7-day retention | $3–6 |
| Object storage (user photos, GeoJSON, tiles cache) | 50–250 GB, S3-compatible (Backblaze B2/Hetzner) | $1–5 |
| Domain + DNS | .com, Cloudflare free plan (CDN, SSL, DDoS) | $1 |
| Managed auth (Clerk/Auth0) | free tier up to ~10k MAU | $0 |
| Map tiles | OSM raster via self-cache + Esri satellite (free tier) or MapTiler free 100k loads | $0 |
| Monitoring/alerts | Uptime Kuma self-hosted + Grafana Cloud free | $0 |
| GitHub Pro (private repo Pages, 3k CI min, Actions runs Spark batch + deploys via SSH) | | $4 |
| **Total Tier A** | | **~$25–45/month** |

**Tier B — Hardened production, country scale (Saudi Arabia, 20–40 city modules)**

| Item | Spec | Monthly |
|---|---|---|
| 2× App VMs behind a load balancer | 8 vCPU / 16 GB each (HA for API + routing engines) | $30–50 |
| DB VM | 8 vCPU / 16 GB / 240 GB NVMe — Postgres+pgRouting primary | $15–25 |
| DB replica / standby VM | same class (failover + read scaling) | $15–25 |
| Graph DB | Memgraph on app VMs, or Neo4j Aura Professional if managed | $0 / +$65 |
| Managed Redis or self-host with persistence | | $0–15 |
| Load balancer + floating IP | | $5–10 |
| Backups, snapshots, off-site dump to object storage | | $8–15 |
| Object storage + CDN egress (Cloudflare free absorbs most) | | $5–15 |
| Auth beyond free tier (~10–25k MAU) | | $0–25 |
| GitHub Team + extra CI minutes (Spark nightly precompute at country scale) | | $8–20 |
| **Total Tier B** | | **~$85–200/month** (self-hosted graph DB) / **~$150–265** with Aura Pro |

**Production-readiness items included in the design (mostly $0, paid in setup time):**

- **CI/CD from GitHub:** Actions pipeline — typecheck/tests → build routing graphs → SSH deploy with zero-downtime restart (or push Docker images to GHCR, free for public repos).
- **TLS + CDN + DDoS:** Cloudflare free plan in front of everything; origin locked to Cloudflare IPs.
- **Backups you can restore:** nightly `pg_dump` + graph exports to object storage, tested restore script in the repo. Snapshots alone are not a backup strategy.
- **Observability:** structured logs, `/healthz` per service, uptime alerts to email/Telegram.
- **Security base:** VMs hardened (SSH keys only, firewall, unattended upgrades), secrets in GitHub Actions secrets — never in the repo.
- **Data residency note:** if Saudi user data rules matter, pick VM regions accordingly (budget providers are EU-heavy; AWS/GCP/Oracle have Middle East regions at ~2–3× cost — Oracle Cloud's free-tier ARM VMs in Jeddah are a notable $0 option worth testing).

**One-time costs:** ~$0–15 (domain first year). Everything else is setup labor: roughly 3–6 days of DevOps work on top of the build estimate in §1.3 for Tier A, 1–2 weeks for Tier B.

> **Bottom line (production):** Tier A **~$25–45/mo** covers a real, public, login-enabled product for Al Ula + nearby cities on GitHub + two budget VMs. Country-scale HA lands at **~$85–200/mo**.

### 1.2c AWS vs. lowest-cost VM providers

Same architecture, GitHub unchanged (CI/CD works identically against AWS). Three ways to run it on AWS, compared to the budget-VM baseline:

**Tier A equivalents (2 app/data machines + storage + backups):**

| Setup | Spec equivalent | Monthly | vs. budget VMs |
|---|---|---|---|
| Budget VMs (Hetzner/Contabo class) — baseline | 2× 4 vCPU / 8 GB NVMe | **$25–45** | 1× |
| **AWS Lightsail** (AWS's fixed-price VPS line) | 2× 2 vCPU / 8 GB ($44 ea) or 2× 4 GB ($24 ea) | **$50–95** | ~2× |
| **AWS EC2 on-demand** (2× t3.large 2 vCPU / 8 GB + 2× 80 GB gp3 EBS + snapshots + egress) | | **$140–180** | ~4–5× |
| **AWS EC2 with 1-yr Savings Plan** (~35–40% off compute) | | **$95–125** | ~3× |
| **AWS managed stack** (RDS Postgres db.t4g.medium + ElastiCache Redis + EC2 app + ALB) | | **$220–320** | ~7–9× |

**Tier B equivalents (country-scale HA):**

| Setup | Monthly |
|---|---|
| Budget VMs — baseline | **$85–200** |
| AWS EC2 + self-managed services, Savings Plan | **$350–550** |
| AWS with RDS Multi-AZ + ElastiCache + ALB + Neptune-or-EC2-Memgraph | **$700–1,200** |

**Where the AWS premium actually comes from:**

- **Compute:** t3.large on-demand ≈ $60/mo vs. an equal-or-better budget VM at $8–15. This is the single biggest gap (4–7× on raw compute).
- **Storage is extra:** EBS gp3 ~$0.08/GB-mo + snapshot costs — budget VMs include NVMe disk in the flat price.
- **Egress:** AWS charges ~$0.09/GB after 100 GB free; map tiles and GeoJSON add up. Cloudflare in front absorbs most of it, but it's a real line item budget providers mostly don't have.
- **Managed services multiply it:** RDS/ElastiCache/ALB each cost more than an entire budget VM. They buy you real value (automated failover, patching, point-in-time recovery) — but it's the difference between $45 and $300/mo at Tier A.

**What AWS gives you for the premium (honest version):**

- **me-south-1 (Bahrain) and il/UAE regions** — low latency to Saudi users and cleaner data-residency posture than EU budget hosts. This is the strongest genuine argument for AWS in this project.
- RDS point-in-time recovery, Multi-AZ failover, IAM, VPC isolation, compliance paperwork — matters at scale/enterprise, overkill for launch.
- **AWS Free Tier:** 12 months of t3.micro + 750 RDS hours can host a *demo* for ~$0, but t3.micro (1 GB) is too small for the routing engines in production.

**Recommended hybrid (best of both):**

- Launch on budget VMs or **AWS Lightsail Bahrain** (fixed pricing, AWS region, ~2× baseline instead of 5×): Tier A ≈ **$50–90/mo** with Saudi-adjacent latency.
- Keep GitHub Actions as the deploy pipeline either way — the infra choice is swappable because everything is plain Linux + Docker Compose.
- Move to full EC2/RDS only when you need Multi-AZ HA or compliance features; the migration is a re-deploy, not a re-architecture.

> **Rule of thumb:** AWS ≈ **2× the cost via Lightsail, 3–5× via EC2, 7–9× via managed services** — the premium buys Middle East regions and managed reliability, not performance.

### 1.3 Engineering time (the real cost)

| Phase | Effort |
|---|---|
| OSM extract, cleaning, verification against Google Maps/Earth | 2–4 days |
| Graph import: OSM → Postgres/pgRouting + Neo4j/Memgraph loaders | 2–3 days |
| Routing engines: GraphHopper + OSRM setup, pgRouting queries | 2–4 days |
| Spark GraphX/GraphFrames precompute jobs (PageRank on intersections, connected components, betweenness for hot segments) | 3–5 days |
| Web API (JSON) + Redis caching layer | 2–3 days |
| Frontend map (Leaflet/MapLibre, layer toggle, route UI) | 3–5 days |
| Docs, README, GitHub CI, polish | 2–3 days |
| **Total** | **~3–4 weeks full-time** (a minimal demo slice: 3–5 days) |

At typical contractor rates ($40–100/hr), the build cost is **~$5k–15k** if outsourced; **$0 cash** if self-built.

### 1.4 Bottom line

> **Cash cost for the PoC: $0 (local/free-tier) to ~$25/month (self-hosted VPS).**
> The dominant cost is 3–4 weeks of engineering time.

---

## 2. Why Al Ula

- Small, well-bounded road network (~10–30k road segments) — every tool in the stack runs instantly on it.
- Rich mix of paved streets, desert roads, and tourist trails (Hegra, Elephant Rock, Old Town) — perfect for showing the OSM + satellite-imagery layer story, since many desert tracks are visible on imagery but missing/incomplete in OSM.
- Tourism relevance makes routing demos (hotel → heritage site) intuitive.

---

## 3. Architecture

### 3.1 High-level diagram

```
                        ┌──────────────────────────────┐
                        │        DATA SOURCES          │
                        │ OSM extract (Geofabrik)      │
                        │ Satellite tiles (Esri/S2)    │
                        │ Manual verify: GMaps/GEarth  │
                        └──────────────┬───────────────┘
                                       │ osmium / osm2pgrouting / osm2neo4j
                 ┌─────────────────────┼──────────────────────┐
                 ▼                     ▼                      ▼
        ┌────────────────┐   ┌─────────────────┐   ┌───────────────────┐
        │ Postgres +     │   │ Neo4j / Memgraph│   │ GraphHopper / OSRM │
        │ pgRouting      │   │ (Cypher)        │   │ (routing engines)  │
        │ edges/vertices │   │ (:Junction)-[:  │   │ contraction        │
        │ Dijkstra, A*,  │   │  ROAD]->(:Junc) │   │ hierarchies        │
        │ KSP            │   │ path queries,   │   │ turn-by-turn       │
        └───────┬────────┘   │ POI graph       │   └─────────┬─────────┘
                │            └────────┬────────┘             │
                │                     │                      │
                │      ┌──────────────▼──────────────┐       │
                │      │  Spark GraphX / GraphFrames │       │
                │      │  BATCH precompute:          │       │
                │      │  • PageRank (key junctions) │       │
                │      │  • Connected components     │       │
                │      │  • Betweenness → hot edges  │       │
                │      │  • Precomputed route matrix │       │
                │      └──────────────┬──────────────┘       │
                │                     │ writes results       │
                ▼                     ▼                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │                     WEB API (JSON)                      │
        │        Node/Express or FastAPI  —  /api/v1/...          │
        │  ┌───────────────────────────────────────────────────┐  │
        │  │ Redis cache:                                      │  │
        │  │  • most-frequent-routes list (ZSET leaderboard)   │  │
        │  │  • adjacency lists (HASH per junction)            │  │
        │  │  • route responses (TTL keys)                     │  │
        │  └───────────────────────────────────────────────────┘  │
        └────────────────────────────┬────────────────────────────┘
                                     ▼
        ┌─────────────────────────────────────────────────────────┐
        │                 FRONTEND (MapLibre GL / Leaflet)        │
        │  OSM street layer ⇄ satellite layer toggle              │
        │  Route drawing, POI graph explorer,                     │
        │  “graph view” overlay (nodes/edges, PageRank sizing)    │
        └─────────────────────────────────────────────────────────┘
```

### 3.2 Component roles & how each demonstrates graph processing

**Graph DB — Neo4j or Memgraph (pick one; recommend Memgraph for self-host, Aura Free for zero-ops)**
- Model: `(:Junction {id, lat, lon})-[:ROAD {length_m, highway, surface, maxspeed}]->(:Junction)`, plus `(:POI)-[:NEAR]->(:Junction)` for heritage sites/hotels.
- Demo Cypher queries:
  ```cypher
  // Shortest path by distance (built-in)
  MATCH (a:Junction {id: $from}), (b:Junction {id: $to})
  CALL apoc.algo.dijkstra(a, b, 'ROAD', 'length_m') YIELD path, weight
  RETURN path, weight;

  // POIs reachable within 3 hops of Old Town
  MATCH (p:POI {name:'AlUla Old Town'})-[:NEAR]->(:Junction)-[:ROAD*1..3]-(j)
  RETURN DISTINCT j;

  // Degree distribution of the road network
  MATCH (j:Junction) RETURN size((j)--()) AS degree, count(*) ORDER BY degree;
  ```

**pgRouting (PostgreSQL)**
- `osm2pgrouting` builds `ways` + `ways_vertices_pgr` tables (the canonical edge list / adjacency representation).
- Demonstrates SQL-side graph algorithms: `pgr_dijkstra`, `pgr_astar`, `pgr_ksp` (k-shortest paths), `pgr_drivingDistance` (isochrones around a hotel).

**GraphHopper & OSRM (routing engines)**
- Both consume the same OSM extract; PoC exposes each behind the API so responses can be compared (`?engine=graphhopper|osrm|pgrouting`).
- Demonstrates contraction hierarchies vs. plain Dijkstra — the performance story of preprocessing graphs.
- OSRM optionally fronted by pgRouting output for the “pgRouting for OSRM” comparison table in the README.

**Apache Spark — GraphX (Scala) / GraphFrames (PySpark)**
- Batch jobs over the edge list exported from Postgres:
  - **PageRank** → identifies structurally important junctions (rendered as bigger nodes on the frontend graph overlay).
  - **Connected components** → data-quality check (finds disconnected desert-trail fragments needing satellite verification).
  - **Betweenness/traffic proxy** → ranks edges likely to be “hot,” seeding the Redis most-frequent list.
  - **Precomputed distance matrix** between the ~20 main POIs → written to Redis for O(1) lookups.
- Runs in Spark local mode; also wired into GitHub Actions as a scheduled batch job to show CI-driven graph precompute.

**Web API (JSON) + Redis**
- Endpoints:
  - `GET /api/v1/route?from&to&engine=` → GeoJSON route (Redis-cached, TTL)
  - `GET /api/v1/routes/top` → most-frequently-requested routes (Redis ZSET, incremented per request)
  - `GET /api/v1/graph/adjacency/{junctionId}` → adjacency list (Redis HASH, precomputed from pgRouting)
  - `GET /api/v1/pois`, `GET /api/v1/graph/stats` (PageRank/components from Spark output)
- Cache strategy: read-through with TTL for routes; write-behind for the frequency leaderboard.

**Frontend**
- MapLibre GL (free, no tokens) with OSM raster/vector tiles + Esri satellite layer toggle.
- Route search UI, POI list (Hegra, Elephant Rock, Maraya, Old Town), and a “show the graph” mode rendering junctions/edges with PageRank-scaled node sizes — the visual proof of graph processing in the frontend.

### 3.3 Data verification workflow (Google Maps / Google Earth)

1. Pull Al Ula OSM extract; run Spark connected-components to flag orphan segments.
2. Overlay flagged segments on the satellite layer; cross-check against Google Maps and Google Earth (historical imagery for seasonal desert tracks).
3. Corrections made upstream in OSM (via JOSM/iD) — keeps the pipeline license-clean, then re-extract.
4. Document each verified trail in `data/verification-log.md` (nice GitHub artifact showing methodology).

### 3.4 GitHub repository layout

```
alula-graph-maps/
├── README.md                  # Architecture, cost table, screenshots
├── data/                      # OSM extract scripts, verification log
├── etl/                       # osmium/osm2pgrouting/neo4j loaders
├── spark/                     # GraphX (Scala) + GraphFrames (PySpark) jobs
├── engines/                   # GraphHopper & OSRM config + docker-compose
├── db/                        # Postgres/pgRouting schema, Cypher scripts
├── api/                       # JSON Web API + Redis caching layer
├── web/                       # MapLibre frontend
├── docker-compose.yml         # One-command local stack
└── .github/workflows/         # CI: typecheck, tests, scheduled Spark batch
```

---

## 4. Recommended PoC sequencing (if/when you build)

1. **Week 1:** Data — extract, verify, load into Postgres/pgRouting; basic map frontend with layer toggle.
2. **Week 2:** Routing — GraphHopper + OSRM + pgRouting behind one API; Redis caching + frequency list.
3. **Week 3:** Graph depth — Neo4j/Memgraph with Cypher demos; Spark GraphX/GraphFrames batch jobs; frontend graph overlay.
4. **Week 4:** Polish — docs, docker-compose, CI, README with engine-comparison benchmarks.

A **minimal 3–5 day slice** (great first GitHub commit): map + pgRouting shortest path + Redis cache + README with this architecture.

---

## 5. Scaling to World Scale — Hierarchical, Incremental Composition

The city PoC is deliberately designed as a **reusable component template**. The same architecture composes recursively up to a world map, and — critically — **construction is incremental and can be bounded by any scope**: a single city, a group of cities, a region, a country, a continent, or the world. You never rebuild the whole; you only add or refresh components.

### 5.1 The component hierarchy

| Level | Component | Graph role | Exposed upward |
|---|---|---|---|
| L0 | **City module** (this PoC) | Dense local graph: every junction & segment | 4–10 border/gateway nodes |
| L1 | **Corridor module** (city ↔ city) | Sparse highway edges linking two modules' border nodes | Its two endpoint sets |
| L2 | **Region / group of cities** | Composition of L0 + L1; overlay graph of gateway nodes | Regional gateway nodes |
| L3 | **Country** | Composition of regions; border-crossing nodes | Border crossings |
| L4 | **Country digital twin** | Same template, different data; can run federated (own infra/region) | Border-node distance tables only |
| L5 | **Continent → World** | Composition of twins | — |

**Key principle:** each component exposes only its *boundary nodes* plus a precomputed internal distance table between them (an "overlay graph"). Al Ula's 30k junctions appear at country level as ~6 gateway nodes. This is the proven Customizable Route Planning (CRP) / graph-partition technique used by planet-scale routers.

### 5.2 Incremental, bounded construction — topology first, fill later

Construction is **skeleton-first**: the full topology is drawn *empty* before any city is built, then components are filled in independently, in any order.

**Phase A — Draw the empty topology.**
Instantiate the entire hierarchy as lightweight stubs in the meta-graph (Neo4j/Memgraph):

```cypher
// The world skeleton exists before any real data does
CREATE (sa:Country {code:'SA', status:'EMPTY'})
CREATE (alula:City {id:'AlUla',  status:'EMPTY', centroid: point({latitude:26.61, longitude:37.92})})
CREATE (khaybar:City {id:'Khaybar', status:'EMPTY', centroid: point({latitude:25.70, longitude:39.29})})
CREATE (alula)-[:CORRIDOR {status:'EMPTY', est_km:220}]->(khaybar)
CREATE (sa)-[:CONTAINS]->(alula), (sa)-[:CONTAINS]->(khaybar);
```

Every city is a single stub node (centroid + boundary polygon + status), every corridor a stub edge with an estimated distance (straight-line or highway-length heuristic). The whole world skeleton — every country, city, and corridor — is a few hundred thousand nodes: it fits in Aura Free and can be drawn on the map immediately.

**Phase B — Fill city items, one component at a time.**
Filling a city = running the L0 PoC pipeline inside that stub's boundary: OSM extract → pgRouting/routing-engine build → boundary-node overlay export → attach to the stub. Status transitions per component:

```
EMPTY → OUTLINED (boundary + gateways known) → FILLED (dense graph built) → VERIFIED (satellite/GMaps checked)
```

**Why this is powerful:**

- **The map and routing work from day one.** On an empty skeleton, a route Al Ula → Riyadh resolves over stub edges (estimated distances). As components reach FILLED, the same query transparently upgrades to real turn-by-turn inside them. Precision improves monotonically; the API contract never changes.
- **Mixed-fidelity routing is native:** dense Dijkstra inside FILLED cities, heuristic hops across EMPTY ones — the two-phase router (§5.3) doesn't care which is which.
- **Fill order is a free choice:** by priority (tourism cities first), by data quality, by team assignment — components have no build-order dependency because the topology already fixes all interfaces (gateway nodes) up front.
- **The frontend visualizes progress:** stub cities render as hollow circles, FILLED ones as real street networks — the world map literally fills in over time, which is also a compelling demo/dashboard.

Every fill step is scoped by an explicit **boundary definition** — an OSM relation ID, admin boundary, bounding polygon, or an arbitrary set of component IDs:

```
build --scope city:AlUla
build --scope group:[AlUla,Khaybar,Tayma]
build --scope region:Madinah-Province
build --scope country:SA
build --scope corridor:AlUla<->Khaybar
```

Properties of the incremental model:

- **Additive:** filling a city compiles only that module + its corridors, then patches the parent overlay graph. Nothing else is touched — the stub node is simply promoted in place.
- **Bounded refresh:** OSM data updates re-trigger ETL only for components whose boundary intersects the changed area (OSM diffs make this cheap).
- **Content-bounded too:** a component can be built with a content profile — e.g. `--content roads,trails` vs. `--content full` (POIs, transit, landuse) — so a tourism-focused Al Ula module and a logistics-focused Riyadh module coexist in one hierarchy.
- **Independently deployable:** each module is a self-contained artifact (routing binary + graph tables + overlay export). A country twin can run in its own cloud/region and federate by exchanging border-node tables only — operationally and politically realistic for multi-country systems.
- **Registry-driven:** a small manifest (`components.json` or a Neo4j meta-graph) records each component's ID, scope, boundary hash, content profile, build timestamp, and parent — enabling `rebuild-stale`, dependency ordering, and world-map assembly as pure composition.

### 5.3 Two-phase routing across components

A route from city A to city B (or across countries) resolves as:

1. Local Dijkstra/A* inside the source module → nearest gateway nodes.
2. Overlay-graph lookup (Neo4j/Memgraph Cypher or precomputed matrix in Redis) across corridors and higher-level components.
3. Local Dijkstra inside the destination module from its entry gateway.

Latency stays flat as the world grows, because step 2 operates on the sparse overlay, never the dense union.

### 5.4 Where each stack piece lands at scale

- **pgRouting / GraphHopper / OSRM:** per-city dense graphs (unchanged from the PoC).
- **Neo4j / Memgraph + Cypher:** the overlay graphs and the component meta-graph/registry — small, relationship-rich, ideal for Cypher.
- **Spark GraphX / GraphFrames:** now genuinely production-grade — computes boundary-node distance tables, partitions, and cross-component matrices as distributed batch jobs (planet OSM ≈ ~3B nodes).
- **Redis:** cache keys namespaced by component ID (`route:{scope}:{from}:{to}`, `adj:{cityId}:{junction}`), so caches shard and invalidate per component.

### 5.5 Cost trajectory

| Scope | Infra estimate |
|---|---|
| 1 city (PoC) | $0–25/mo |
| Group of cities / region (3–10 modules + corridors) | $25–75/mo |
| Country (Saudi Arabia, ~20–40 modules) | $50–200/mo |
| Continent | $300–1,000/mo |
| World (planet OSM with routing) | $500–3,000+/mo + real DevOps |

The induction step to demonstrate on GitHub: **Al Ula + Khaybar + the corridor between them**, with the registry and overlay graph — that proves every level above it.

## 6. User Interaction Layer — Accounts, Stored Map Data & Sharing

The map becomes a platform when users can sign in, create content *on the graph*, and share it. The natural design: **user content is itself a graph, anchored to the road-network graph** — which keeps the whole system in one modeling language (Cypher) and makes sharing/social features into simple graph queries.

### 6.1 Authentication

- **PoC:** managed auth (Clerk, Auth0 free tier, or Supabase Auth) — email + Google/Apple sign-in, zero password handling. Cost: $0 at PoC scale.
- Sessions as short-lived JWTs; the JSON API validates the token and resolves it to a `(:User)` node.
- Roles: `visitor` (read public content), `member` (create/save/share), `editor` (verify trails, moderate), `admin`.

### 6.2 User data on the map model

All user content is graph-anchored — snapped to real junctions/edges so it composes with routing:

```cypher
(:User {id, name, avatar})
(:User)-[:CREATED]->(:Place {name, note, photos})-[:AT]->(:Junction)
(:User)-[:CREATED]->(:Route {name, engine, geojson_ref})-[:VIA*]->(:Junction)
(:User)-[:CREATED]->(:Trail {surface, verified, difficulty})-[:USES]->(:ROAD-edge refs)
(:User)-[:CREATED]->(:MapLayer {title, style})-[:CONTAINS]->(:Place|:Route|:Trail)
(:User)-[:FAVORITED|:VISITED {at}]->(:POI|:Place)
```

Interactive features this unlocks (each is one Cypher query):

| Feature | User action | Graph effect |
|---|---|---|
| **Saved routes** | Plan a route, hit save | `(:Route)` node + Redis-cached GeoJSON; feeds the most-frequent-routes leaderboard with real usage |
| **Custom places & notes** | Drop a pin ("great sunset spot near Elephant Rock") | `(:Place)-[:AT]->(:Junction)` — routable immediately |
| **Trail reports** | Draw/confirm a desert trail on the satellite layer | `(:Trail)` in `PROPOSED` state → editor verifies → promoted into the routable graph (crowdsourced verification, complementing §3.3) |
| **Check-ins / visit log** | "I was here" | `(:User)-[:VISITED {at}]->(:POI)` — personal travel graph, per-user heatmap |
| **Collections / trip plans** | Group places+routes into "My AlUla Weekend" | `(:MapLayer)` container node |
| **Live ratings** | Rate a road segment (scenic, rough, sandy) | Edge properties aggregated per segment; optionally weights routing ("scenic route" profile) |

Storage split: graph relationships in Neo4j/Memgraph; route geometries and photos in Postgres/object storage (referenced by ID); hot user data (session, recent routes, favorites) in Redis.

### 6.3 Sharing model

Sharing is graph-native — a permission is just an edge:

```cypher
(:User)-[:SHARED {mode:'view'|'edit', at}]->(:MapLayer|:Route|:Place)<-[:WITH]-(:User|:Group)
(:MapLayer {visibility:'private'|'link'|'public'})
```

- **Share by link:** any route/place/collection gets a short URL (`/s/x7Kq2`) → opens the map centered on the shared object; no login needed for `link`/`public` visibility. Short-code → object-ID mapping lives in Redis.
- **Share with users/groups:** explicit `SHARED` edges; "shared with me" is a 1-hop query.
- **Public gallery:** browse popular public routes/collections per city — ranked by favorites + view counts (Redis ZSET), another showcase of the frequency-list pattern.
- **Collaborative layers:** `mode:'edit'` lets a group co-build a trip plan; last-write-wins at PoC level, CRDT later if needed.
- **Embeds:** public objects exposed as an iframe/GeoJSON endpoint so users can embed their map in a blog.

Access control resolves as a graph query — "can user U see object O?" is a short path check (owner, SHARED edge, group membership, or public flag) and is cached in Redis per (user, object).

### 6.4 How it fits the incremental world model

- User content attaches to **stub cities too**: users can drop places and draw trails in an `EMPTY` city — their content becomes seed data and a prioritization signal for which city to fill next (fill where users are active).
- Each component's user-content subgraph shards with it, so the federation story (§5.2) holds: a country twin carries its own users' data, sharing across twins exchanges only object references.
- Cost impact at PoC: **~$0** (managed-auth free tier, existing DBs). At country scale, add ~$10–30/mo for object storage of photos.

## 7. Risks & notes

- **Licensing:** Do not trace geometry *from* Google imagery into OSM (against Google ToS). Use Google only for verification; trace from Esri/Bing (which permit OSM tracing) or open imagery.
- **Redundancy is intentional here:** four routing paths (Cypher, pgRouting, GraphHopper, OSRM) exist purely to showcase and benchmark — a production system would pick one.
- **Free-tier limits:** Aura Free sleeps after inactivity (3-day pause); Memgraph self-hosted avoids this at the cost of running a VPS.
- **Spark at this scale** is a teaching demonstration — the whole Al Ula graph fits in memory of any laptop; frame it that way in the README to keep the project credible.
