# Maps — Deployment Guide

End-to-end guide for deploying the Al Ula graph-maps project to two cloud VMs with GitHub Actions.

You have **two provider choices** ready:

| Provider | Cost | Best for | Default VM shape |
|---|---|---|---|
| **Oracle Cloud (OCI)** | **Free** with Always Free tier | Cost-free PoC / personal projects | 2 × Ampere A1 Flex (1 OCPU / 6 GB RAM each) |
| **Hetzner Cloud** | ~€15/month | Predictable low-cost, more sizing options | 2 × cx32 (4 vCPU / 8 GB RAM each) |

Both deploy the same two-VM topology:

| VM | Role | Public ports | Core stack |
|---|---|---|---|
| `maps-presenting` | **Graph presenting** | 22, 80, 443 | Caddy, API server (Docker), Redis, GraphHopper |
| `maps-processing` | **Graph processing** | 22 (DB ports to presenting VM only) | PostgreSQL + PostGIS + pgRouting, Memgraph, Kafka, Spark, Airflow |

---

## 1. Enable the staged GitHub Actions workflows

The GitHub connector used to sync the repo cannot create new files under `.github/workflows/`. The workflows are therefore staged in `infra/github-workflows/` and must be moved into place locally.

### Hetzner path (default, low cost)

```bash
git clone git@github.com:malkahtani1981/maps.git
cd maps
mv infra/github-workflows/infra.yml .github/workflows/
mv infra/github-workflows/deploy.yml .github/workflows/
git add .github/workflows/
git commit -m "Enable Hetzner GitHub Actions workflows"
git push
```

### Oracle Cloud path (free tier)

```bash
git clone git@github.com:malkahtani1981/maps.git
cd maps
mv infra/github-workflows/infra-oci.yml .github/workflows/
mv infra/github-workflows/deploy-oci.yml .github/workflows/
git add .github/workflows/
git commit -m "Enable Oracle Cloud GitHub Actions workflows"
git push
```

After moving, two workflows appear in the GitHub Actions tab:
- **Infrastructure (Terraform / …)** — provision the two VMs
- **Build & Deploy (Ansible / …)** — build the API image and deploy to both VMs

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

### Shared secrets (required for both providers)

| Secret | Value |
|---|---|
| `DEPLOY_SSH_PUBLIC_KEY` | Contents of `~/.ssh/maps_deploy.pub` |
| `DEPLOY_SSH_PRIVATE_KEY` | Contents of `~/.ssh/maps_deploy` |
| `POSTGRES_PASSWORD` | Strong password for the `maps` PostgreSQL user |
| `PRESENTING_HOST` | Leave blank for now; filled after provisioning |
| `PROCESSING_HOST` | Leave blank for now; filled after provisioning |

### Shared variables

| Variable | Value |
|---|---|
| `DOMAIN` (optional) | Domain name, e.g. `maps.example.com` — enables automatic HTTPS via Caddy |

### Hetzner-only secrets

| Secret | Value |
|---|---|
| `HCLOUD_TOKEN` | Hetzner Cloud API token (read/write) from your Hetzner project |

### Oracle Cloud-only secrets

| Secret | Value |
|---|---|
| `OCI_TENANCY_OCID` | OCI tenancy OCID |
| `OCI_USER_OCID` | OCI user OCID |
| `OCI_FINGERPRINT` | OCI API key fingerprint |
| `OCI_PRIVATE_KEY` | Full contents of the OCI API private key PEM file |
| `OCI_COMPARTMENT_OCID` (optional) | OCI compartment OCID; leave blank to use the root compartment |

### Oracle Cloud-only variables

| Variable | Value |
|---|---|
| `OCI_REGION` | e.g. `us-ashburn-1`, `eu-frankfurt-1` |
| `OCI_AVAILABILITY_DOMAIN` (optional) | e.g. `AD-1`; leave blank to auto-select the first AD |

---

## 4. Choose your provider and provision the VMs

### Option A — Oracle Cloud (free tier)

> **Is Oracle Cloud really free forever?**  
> Oracle Cloud Free Tier provides **Always Free** resources that are free for the life of the account in your home region. For compute, this includes up to **2 AMD Micro VMs** (`VM.Standard.E2.1.Micro`, 1/8 OCPU + 1 GB RAM each) and **Ampere A1 resources** equivalent to **2 OCPUs and 12 GB RAM** per month. This project defaults to **2 × Ampere A1 Flex** (1 OCPU + 6 GB RAM each), which fits exactly in that free quota. Availability can vary by region and AD; if a shape is out of capacity, try another region/AD or switch to the paid tier.

In GitHub: **Actions → "Infrastructure (Terraform / Oracle Cloud)" → Run workflow → set `apply=true`**.

Or locally:

```bash
cd infra/terraform-oci
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your OCIDs and SSH public key
terraform init
terraform apply
terraform output
```

This creates a VCN, public subnet, security rules, and two Ubuntu 24.04 instances (`maps-presenting` and `maps-processing`). Database ports are reachable only from within the same subnet, which is enforced by the OCI security list.

### Option B — Hetzner Cloud (low cost)

In GitHub: **Actions → "Infrastructure (Terraform / Hetzner)" → Run workflow → set `apply=true`**.

Or locally:

```bash
cd infra/terraform
terraform init
terraform apply
terraform output
```

This creates two `cx32` Ubuntu 24.04 servers in `fsn1` (or the region you set). Hetzner firewalls lock DB/Bolt/Kafka ports to the presenting VM's IP.

---

## 5. Save the VM IPs and point the domain

After Terraform finishes, copy the public IPv4 addresses into the GitHub secrets:

- `PRESENTING_HOST` = public IP of `maps-presenting`
- `PROCESSING_HOST` = public IP of `maps-processing`

If you set a `DOMAIN` variable, add an A record pointing to `PRESENTING_HOST`.

---

## 6. Deploy the application

The deploy workflow triggers automatically on every push to `main`, or you can run it manually:

**GitHub:** Actions → "Build & Deploy (Ansible / …)" → Run workflow

What it does:
1. Builds `ghcr.io/<owner>/maps-api:latest` from the repo root so `data/alula-roads.json` is baked into the image
2. Pushes the image to GitHub Container Registry
3. SSHs into both VMs using the deploy key
4. Runs the Ansible playbook to install Docker, configure UFW, and start both stacks

> **Note:** OCI Ubuntu images use the `ubuntu` user; Hetzner uses `root`. The Ansible playbook uses `become: true` in both cases, so privilege escalation works regardless of the initial user.

---

## 7. Start extended services (optional, for full graph-lessons stack)

The default stack runs the core graph-processing and graph-presenting services. To also enable Kafka, Spark, Airflow, OSRM, Photon, Prometheus, and Grafana:

```bash
# On maps-processing
ssh -i ~/.ssh/maps_deploy root@${PROCESSING_HOST}   # or ubuntu@ for OCI
cd /opt/maps/processing
docker compose --profile extended up -d

# On maps-presenting
ssh -i ~/.ssh/maps_deploy root@${PRESENTING_HOST}   # or ubuntu@ for OCI
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
ssh -i ~/.ssh/maps_deploy root@${PROCESSING_HOST}   # or ubuntu@ for OCI
# Load Memgraph via mgconsole
# Load PostgreSQL via osm2pgrouting
```

Then the presenting API can be pointed at the other engines by editing `/opt/maps/presenting/.env` and restarting the API container:

```bash
ssh -i ~/.ssh/maps_deploy root@${PRESENTING_HOST}   # or ubuntu@ for OCI
cd /opt/maps/presenting
# Edit .env to set:
#   PGROUTING_DATABASE_URL=postgresql://maps:<POSTGRES_PASSWORD>@${PROCESSING_HOST}/maps
#   GRAPHHOPPER_URL=http://graphhopper:8980
#   REDIS_URL=redis://redis:6379
docker compose up -d api
```

---

## 10. Daily operations

- **Terraform changes:** planned automatically on PRs touching the provider's terraform folder; applied only via manual dispatch with `apply=true`.
- **Application deploys:** every push to `main` triggers the full Ansible deploy (or run it manually).
- **Backups:** nightly `pg_dump` on the processing VM with 7-day retention in `/opt/maps/backups`. Sync this directory to any S3-compatible bucket for off-site copies. For a secure admin demo, see `ADMIN_DEMO.md`.
- **Terraform state:** local by default. For team use, configure an S3-compatible backend in `infra/terraform/main.tf` or `infra/terraform-oci/main.tf`.

---

## Estimated cost

### Oracle Cloud (Always Free)

- **€0/month** for the default 2 × Ampere A1 Flex (1 OCPU / 6 GB RAM each) as long as you stay within the Always Free quota.
- Boot volumes are also within the Always Free block storage limits (200 GB total for boot volumes).

### Hetzner Cloud

At default `cx32` instances in Hetzner's `fsn1` region:

- ~€7.6 per VM × 2 = ~€15.2/month (plus VAT and any Hetzner traffic overages)

Extended services (Spark, Airflow, Photon) share the same two VMs; no additional compute cost unless you resize the instances.

---

## Troubleshooting

- **Blank preview / 404 on `/api`:** ensure the `PRESENTING_HOST` secret is set and the API container is healthy with `docker logs api` on the presenting VM.
- **Database connection refused:** check that the presenting VM's IP/subnet is allowed in the firewall/security rules and that Terraform applied successfully.
- **GraphHopper or pgRouting returns 503:** those engines are inactive until their containers are configured and reachable. The in-memory `memory` engine always works.
- **Oracle Cloud "out of capacity" error:** the chosen Always Free shape is temporarily unavailable in that AD. Try another availability domain or region, or reduce the OCPU/RAM allocation.
