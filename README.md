# Maps — Educational Graph-Processing Project (Al Ula example)

    An educational project showing how to use mature, industry-standard graph-processing software — the systems big tech companies run in production — with **map building and routing as the worked example** (Al Ula, Saudi Arabia).

    **Stack:** PostgreSQL + PostGIS + pgRouting · Memgraph/Neo4j (Cypher) · Apache Spark GraphX/GraphFrames · Apache Kafka · Apache Airflow · GraphHopper · OSRM · Redis · Elasticsearch/Photon · MapLibre GL · Prometheus + Grafana

    **Deployment:** two Hetzner Cloud VMs provisioned by Terraform + Ansible, deployed by GitHub Actions:
    - **Graph processing VM** — PostgreSQL/pgRouting, Memgraph, Kafka, Spark, Airflow
    - **Graph presenting VM** — Caddy (TLS), JSON API, Redis, GraphHopper, OSRM, Photon, Prometheus/Grafana, MapLibre frontend

    Start here:
    - **docs/alula-map-poc-cost-and-architecture.md** — full educational architecture: what each technology teaches, per-VM software roles, hierarchical scaling to country/world level, user-content graph layer
    - **infra/** — Terraform (Hetzner) + Ansible. See infra/README.md for setup.
    - **infra/github-workflows/** — CI/CD workflows (move into `.github/workflows/` to activate — see that folder's README)

    Application code:
    - **api/** — Express + TypeScript routing API and MapLibre frontend. Three interchangeable engines behind `GET /api/route`: in-memory Dijkstra/A* (always on), pgRouting (PostGIS), GraphHopper (CH). Redis cache-aside. See api/README.md.
    - **etl/** — Overpass fetch, CSV export, osm2pgrouting and Memgraph Cypher load steps. See etl/README.md.
    - **spark-jobs/** — GraphFrames PageRank / connected-components analysis of the road network.
    - **data/** — Al Ula OSM extract snapshot (1,475 ways, 7,811 nodes) + derived edge/node CSVs.
    

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).
