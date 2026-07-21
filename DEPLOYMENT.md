# Maps — Deployment Guide (Hetzner Cloud)

End-to-end guide for deploying the Al Ula graph-maps project to two Hetzner Cloud VMs with GitHub Actions.

## Topology

| VM | Role | Public ports | Core stack |
|---|---|---|---|
| `maps-presenting` | **Graph presenting** | 22, 80, 443 | Caddy, API server (Docker), Redis, GraphHopper |
| `maps-processing` | **Graph processing** | 22 (plus selected ports to presenting IP only) | PostgreSQL + PostGIS + pgRouting, Memgraph, Kafka, Spark, Airflow |

Database ports (Postgres 5432, Memgraph Bolt 7687, Kafka 9092) are reachable only from the presenting VM's IP via Hetzner firewall + UFW.

---

## 1. Enable the staged GitHub Actions workflows

The GitHub connector used to sync the repo cannot write files under `.github/workflows/`. The workflows are therefore staged in `infra/github-workflows/` and must be moved into place locally:

```bash
git clone git@github.com:malkahtani1981/maps.git
cd maps
mv infra/github-workflows/infra.yml .github/workflows/
mv infra/github-workflows/deploy.yml .github/workflows/
git add .github/workflows/
git commit -m "Enable GitHub Actions workflows"
git push
```

After this step, two workflows appear in the GitHub Actions tab:
- **Infrastructure (Terraform / Hetzner)** — provision the two VMs
- **Build & Deploy (Ansible)** — build the API image and deploy to both VMs

---

## 2. Generate a deploy SSH key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/maps_deploy -N ""
```

Store the files as GitHub Actions secrets:
- `~/.ssh/maps_deploy.pub` → **DEPLOY_SSH_PUBLIC_KEY**
- `~/.ssh/maps_deploy` → **DEPLOY_SSH_PRIVATE_KEY**

---

## 3. Add GitHub Actions secrets and variables

Go to **GitHub → repo → Settings → Secrets and variables → Actions**.

### Repository secrets

| Secret | Value |
|---|---|
| `HCLOUD_TOKEN` | Hetzner Cloud API token (read/write) from your Hetzner project |
| `DEPLOY_SSH_PUBLIC_KEY` | Contents of `~/.ssh/maps_deploy.pub` |
| `DEPLOY_SSH_PRIVATE_KEY` | Contents of `~/.ssh/maps_deploy` |
| `POSTGRES_PASSWORD` | Strong password for the `maps` PostgreSQL user |
| `PRESENTING_HOST` | Leave blank for now; filled after step 5 |
| `PROCESSING_HOST` | Leave blank for now; filled after step 5 |

### Repository variables

| Variable | Value |
|---|---|
| `DOMAIN` (optional) | Domain name, e.g. `maps.example.com` — enables automatic HTTPS via Caddy |

---

## 4. Provision the Hetzner VMs

Run the infrastructure workflow:

**GitHub:** Actions → "Infrastructure (Terraform / Hetzner)" → Run workflow → set `apply=true`

**Or locally:**

```bash
cd infra/terraform
terraform init
terraform apply
terraform output
```

Terraform creates:
- Two `cx32` Ubuntu 24.04 servers (`maps-presenting` and `maps-processing`)
- Hetzner firewalls locking down internal ports to the presenting VM's IP
- SSH key injection using the deploy key

Default region is `fsn1` and server type is `cx32` (4 vCPU / 8 GB / 80 GB NVMe). Change `presenting_server_type` and `processing_server_type` in `infra/terraform/variables.tf` if needed.

---

## 5. Save the VM IPs and point the domain

After Terraform finishes, copy the public IPv4 addresses into the GitHub secrets:

- `PRESENTING_HOST` = public IP of `maps-presenting`
- `PROCESSING_HOST` = public IP of `maps-processing`

If you set a `DOMAIN` variable, add an A record pointing to `PRESENTING_HOST`.

---

## 6. Deploy the application

The deploy workflow triggers automatically on every push to `main`, or you can run it manually:

**GitHub:** Actions → "Build & Deploy (Ansible)" → Run workflow

What it does:
1. Builds `ghcr.io/<owner>/maps-api:latest` from the repo root so `data/alula-roads.json` is baked into the image
2. Pushes the image to GitHub Container Registry
3. SSHs into both VMs using the deploy key
4. Runs the Ansible playbook to install Docker, configure UFW, and start both stacks

---

## 7. Start extended services (optional, for full graph-lessons stack)

The default stack runs the core graph-processing and graph-presenting services. To also enable Kafka, Spark, Airflow, OSRM, Photon, Prometheus, and Grafana:

```bash
# On maps-processing
ssh -i ~/.ssh/maps_deploy root@${PROCESSING_HOST}
cd /opt/maps/processing
docker compose --profile extended up -d

# On maps-presenting
ssh -i ~/.ssh/maps_deploy root@${PRESENTING_HOST}
cd /opt/maps/presenting
docker compose --profile extended up -d
```

These services are single-node educational deployments. Admin UIs are bound to localhost; reach them via SSH tunnels.

---

## 8. Verify the deployment

```bash
# Health / stats
export HOST=${DOMAIN:-$PRESENTING_HOST}
curl https://${HOST}/api/healthz
curl https://${HOST}/api/graph/stats

# Route query using the in-memory engine
curl "https://${HOST}/api/route?from=26.608,37.916&to=26.63,37.95&engine=memory"

# If no DOMAIN, use http instead of https:
curl "http://${PRESENTING_HOST}/api/graph/stats"
```

---

## 9. Load the graph into other stores (optional)

The API image already contains the Al Ula OSM snapshot. To additionally enable pgRouting and Memgraph comparisons, run the ETL steps on the processing VM as described in `etl/README.md`:

```bash
ssh -i ~/.ssh/maps_deploy root@${PROCESSING_HOST}
# Load Memgraph via mgconsole
# Load PostgreSQL via osm2pgrouting
```

Then the presenting API can be pointed at the other engines by editing `/opt/maps/presenting/.env` and restarting the API container:

```bash
ssh -i ~/.ssh/maps_deploy root@${PRESENTING_HOST}
cd /opt/maps/presenting
# Edit .env to set:
#   PGROUTING_DATABASE_URL=postgresql://maps:<POSTGRES_PASSWORD>@${PROCESSING_HOST}/maps
#   GRAPHHOPPER_URL=http://graphhopper:8980
#   REDIS_URL=redis://redis:6379
docker compose up -d api
```

---

## 10. Daily operations

- **Terraform changes:** planned automatically on PRs touching `infra/terraform/**`; applied only via manual dispatch with `apply=true`.
- **Application deploys:** every push to `main` triggers the full Ansible deploy (or run it manually).
- **Backups:** nightly `pg_dump` on the processing VM with 7-day retention in `/opt/maps/backups`. Sync this directory to any S3-compatible bucket for off-site copies.
- **Terraform state:** local by default. For team use, configure an S3-compatible backend in `infra/terraform/main.tf`.

---

## Estimated cost

At default `cx32` instances in Hetzner's `fsn1` region:

- ~€7.6 per VM × 2 = ~€15.2/month (plus VAT and any Hetzner traffic overages)

Extended services (Spark, Airflow, Photon) share the same two VMs; no additional compute cost unless you resize the instances.

---

## Troubleshooting

- **Blank preview / 404 on `/api`:** ensure the `PRESENTING_HOST` secret is set and the API container is healthy with `docker logs api` on the presenting VM.
- **Database connection refused:** check that the presenting VM's IP is in `PRESENTING_HOST` and that Terraform firewall rules applied.
- **GraphHopper or pgRouting returns 503:** those engines are inactive until their containers are configured and reachable. The in-memory `memory` engine always works.
