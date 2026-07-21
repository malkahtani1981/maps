# Maps — Infrastructure (Terraform + Ansible + GitHub Actions, Hetzner Cloud)

Two-VM deployment on **Hetzner Cloud**, fully provisioned by CI/CD.

## Topology

| VM | Role | Software (core) | Software (extended profile) |
|---|---|---|---|
| `maps-processing` | **Graph processing** | PostgreSQL + PostGIS + pgRouting, Memgraph (Bolt :7687), nightly `pg_dump` backups | Apache Kafka, Apache Spark (GraphX/GraphFrames), Apache Airflow |
| `maps-presenting` | **Graph presenting** | Caddy (automatic HTTPS), JSON Web API (GHCR image), Redis, GraphHopper, MapLibre frontend | OSRM, Photon geocoder (Elasticsearch), Prometheus + Grafana |

Extended services carry a Docker Compose `extended` profile — start them with `docker compose --profile extended up -d` on the respective VM (single-node educational deployments; admin UIs bound to localhost, reach via SSH tunnel).

DB ports (5432, 7687) accept traffic **only from the presenting VM's IP** (enforced in both the Hetzner firewall and UFW). Only 22/80/443 are public on the presenting VM.

## Layout

```
infra/
├── terraform/          # 2 Hetzner servers, firewalls, SSH key
└── ansible/            # Hardening, Docker, processing_stack + presenting_stack
.github/workflows/
├── infra.yml           # terraform fmt/validate/plan on PR; apply via manual dispatch
└── deploy.yml          # build API image → GHCR → ansible-playbook deploy on push to main
```

## One-time setup

1. **Hetzner**: create a project → Security → API Tokens → generate a read/write token.
2. **Generate a deploy key**: `ssh-keygen -t ed25519 -f ~/.ssh/maps_deploy -N ""`
3. **GitHub → repo Settings → Secrets and variables → Actions**, add secrets:
   - `HCLOUD_TOKEN` (from step 1)
   - `DEPLOY_SSH_PUBLIC_KEY`, `DEPLOY_SSH_PRIVATE_KEY` (from step 2)
   - `POSTGRES_PASSWORD`
   - `PRESENTING_HOST`, `PROCESSING_HOST` (fill after first `terraform apply`)
   - Variable: `DOMAIN` (optional — enables automatic HTTPS via Caddy)
4. **Provision**: Actions → "Infrastructure (Terraform / Hetzner)" → Run workflow with `apply=true`
   (or locally: `cd infra/terraform && terraform init && terraform apply`)
5. Copy the IP outputs into `PRESENTING_HOST` / `PROCESSING_HOST` secrets; point your domain's A record at the presenting IP.
6. **Deploy**: push to `main` — the deploy workflow hardens both VMs, installs Docker, and starts both stacks.

## Local usage

```bash
cd infra/terraform
terraform init && terraform apply
terraform output -raw ansible_inventory > ../ansible/inventory.ini

cd ../ansible
cp group_vars/all.yml.example group_vars/all.yml   # fill in values (gitignored)
ansible-playbook site.yml
```

## Notes

- Server types default to `cx32` (4 vCPU / 8 GB / 80 GB NVMe); change `presenting_server_type` / `processing_server_type` to resize.
- Hetzner Ubuntu images log in as `root`; the inventory and playbooks assume `ansible_user=root`.
- Nightly `pg_dump` backups with 7-day retention on the processing VM; sync `/opt/maps/backups` to any S3-compatible bucket for off-site copies.
- Terraform state: local by default — configure an S3-compatible backend in `main.tf` for team/CI use.
