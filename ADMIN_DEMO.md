# Admin Demo Guide — Two-VM Graph Maps Lab

This guide explains how to run the two-VM graph-maps stack as a **safe admin demo** while preserving security and protecting against data loss.

The default infrastructure already ships with several hardening choices; this document explains them, adds a few optional hardening steps, and gives you a repeatable demo workflow.

---

## 1. What is already secured by default

The Ansible playbooks (`infra/ansible/roles/common/`) configure both VMs with:

| Control | Status | Purpose |
|---|---|---|
| SSH password auth disabled | ✅ | Only the deploy key can log in |
| UFW default-deny incoming | ✅ | Only explicitly opened ports are reachable |
| fail2ban | ✅ | Brute-force login protection |
| Unattended security upgrades | ✅ | OS patches applied automatically |
| Database ports (5432, 7687, 9092) | ✅ | Open only to the presenting VM's IP |
| Admin UIs (Grafana, Spark, Airflow) | ✅ | Bound to `127.0.0.1` by default; not public |
| Caddy HTTPS | ✅ | When a `DOMAIN` variable is set |

---

## 2. Demo-day security checklist

Before sharing the demo URL, run through these items.

### 2.1 Lock the public surface to the minimum

Only the presenting VM needs public ports. Confirm:

```bash
# On maps-presenting
sudo ufw status
# Should show: 22, 80, 443 ALLOW Anywhere

# On maps-processing
sudo ufw status
# Should show: 22 ALLOW Anywhere, 5432/7687/9092 ALLOW from presenting IP only
```

### 2.2 Restrict SSH access to your IP

The default `ssh_allowed_cidrs` in Terraform is `0.0.0.0/0`. For a demo, tighten it to your office/home IP:

```bash
# Get your public IP
curl https://ipinfo.io/ip
```

In `infra/terraform/variables.tf` (Hetzner) or `infra/terraform-oci/variables.tf` (Oracle), set:

```hcl
ssh_allowed_cidrs = ["YOUR.IP.ADDRESS/32"]
```

Then re-run the Terraform workflow. If you need CI/CD to keep working, also add the GitHub Actions runner IP ranges or keep the workflow manual.

### 2.3 Access admin UIs through SSH tunnels, not public ports

Admin dashboards are intentionally **not** exposed publicly. During a demo, use an SSH tunnel from your laptop:

```bash
# Grafana on presenting VM (maps-presenting)
ssh -i ~/.ssh/maps_deploy -L 3000:127.0.0.1:3000 root@PRESENTING_HOST
# Then open http://localhost:3000 in your browser

# Spark UI on processing VM (maps-processing)
ssh -i ~/.ssh/maps_deploy -L 8081:127.0.0.1:8081 root@PROCESSING_HOST
# Then open http://localhost:8081

# Airflow UI on processing VM
ssh -i ~/.ssh/maps_deploy -L 8082:127.0.0.1:8082 root@PROCESSING_HOST
# Then open http://localhost:8082
```

> OCI users: replace `root@` with `ubuntu@`.

### 2.4 Optional: expose Grafana via Caddy with basic auth

If you must show Grafana on a public path, put it behind Caddy's basic auth so only demo admins can open it:

1. Create a password hash on the presenting VM:

   ```bash
   caddy hash-password --plaintext 'demo-admin-password'
   ```

2. Add to `/opt/maps/presenting/Caddyfile` inside the existing block:

   ```caddy
   handle /grafana/* {
       basicauth {
           demo-admin $2a$14$...hash...
       }
       reverse_proxy grafana:3000
   }
   ```

3. Restart Caddy:

   ```bash
   docker compose -f /opt/maps/presenting/docker-compose.yml restart caddy
   ```

### 2.5 Set a read-only PostgreSQL demo user (optional)

If you want to show SQL queries without risk of mutation:

```bash
ssh -i ~/.ssh/maps_deploy root@PROCESSING_HOST
docker exec -it maps-postgres psql -U maps -d maps
CREATE USER demo_read WITH PASSWORD 'a-strong-password';
GRANT USAGE ON SCHEMA public TO demo_read;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO demo_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO demo_read;
```

Use this user for any live SQL demos.

---

## 3. Preventing loss

### 3.1 Nightly database backups (already enabled)

The processing VM runs a cron job at 02:30 that dumps the `maps` database:

```bash
/opt/maps/backups/maps-YYYY-MM-DD.sql.gz
```

Backups are kept for 7 days. For a demo environment, copy these off the VM so a VM recreation is not a data loss event.

### 3.2 Sync backups to object storage

Add a small cron job to push backups to any S3-compatible bucket (e.g., Hetzner Object Storage, Backblaze B2, AWS S3, Oracle Object Storage, or Replit Object Storage).

A script is provided at `scripts/sync-backups.sh`:

```bash
# On maps-processing
crontab -e
# add:
0 4 * * * /opt/maps/scripts/sync-backups.sh s3://my-bucket/maps-backups 2>&1 | logger -t maps-backup
```

The script requires the `S3_ENDPOINT`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` environment variables. Set them in `/opt/maps/scripts/.env`.

### 3.3 Docker volumes with persistent host paths

The Docker Compose files use named volumes. For extra safety, you can override them with bind mounts so the data lives on the host filesystem and is easier to snapshot:

```yaml
# In /opt/maps/processing/docker-compose.yml override
volumes:
  - /opt/maps/data/postgres:/var/lib/postgresql/data
```

> Make a backup before changing volume mounts on a running system.

### 3.4 Remote Terraform state

Local Terraform state is fine for a solo demo, but a lost VM can also mean a lost `terraform.tfstate`. Store state remotely:

- Hetzner users: Hetzner Object Storage backend
- Oracle users: Oracle Object Storage backend
- Generic: any S3-compatible backend

Uncomment and configure the `backend "s3"` block in `infra/terraform/main.tf` or `infra/terraform-oci/main.tf`.

### 3.5 GitHub as the source of truth

All application code, Docker packaging, and infrastructure definitions live in the GitHub repo. Never make critical changes directly on the VMs; always edit the repo and redeploy. This makes recovery as simple as `terraform apply` + `ansible-playbook site.yml`.

### 3.6 Provider snapshots

For a one-time demo, take a snapshot of each VM after the first successful deploy:

- **Hetzner Cloud:** Console → Snapshots → Create for each server.
- **Oracle Cloud:** Console → Block Volumes → Create Manual Backup for each boot volume.

Snapshots let you roll back to a known-good demo state in minutes.

---

## 4. Demo profile (limited resource usage)

For a demo on small free-tier instances, you can run only the core services and skip the heavy extended profile:

```bash
# On both VMs — no extended profile
ssh root@PROCESSING_HOST
cd /opt/maps/processing
docker compose up -d

ssh root@PRESENTING_HOST
cd /opt/maps/presenting
docker compose up -d
```

This keeps the stack to: Caddy, API, Redis, PostgreSQL+pgRouting, and Memgraph. It runs comfortably on the 2 OCPU / 12 GB Oracle Always Free tier or Hetzner cx32 instances.

---

## 5. Recommended demo agenda

1. **Show the public URL** (`https://YOUR_DOMAIN` or `http://PRESENTING_HOST`) and route between two points on the Al Ula map.
2. **Compare algorithms** — run A* vs Dijkstra on the same pair and point out the `visitedCount` difference.
3. **Show the engine panel** — explain that `memory` is always on, while `pgrouting` and `graphhopper` activate when the backend services are configured.
4. **Switch map layers** — OSM, satellite, terrain.
5. **Click a point** and show the OpenStreetMap / Google Maps / Google Earth verification links.
6. **SSH tunnel into Grafana/Spark/Airflow** to show the backend monitoring and batch-processing stack.

---

## 6. Post-demo cleanup

If the demo is temporary:

1. **Delete the VMs** via Terraform or the cloud console to stop billing (or keep them running for the free Oracle tier).
2. **Remove DNS records** if you created a `DOMAIN`.
3. **Rotate the deploy SSH key** if you shared the private key with anyone.
4. **Remove any Caddy basic-auth passwords** you added for the demo.

---

## 7. Emergency recovery checklist

| Scenario | Recovery step |
|---|---|
| Presenting VM fails | Restore from snapshot, or `terraform apply` + re-run deploy workflow |
| Processing VM fails | Restore from snapshot, or `terraform apply`; restore latest `maps-YYYY-MM-DD.sql.gz` into Postgres |
| Database corruption | Stop Postgres, restore from latest backup: `zcat backup.sql.gz \| docker exec -i maps-postgres psql -U maps` |
| Lost SSH key | Generate a new keypair, update the cloud metadata, and re-run Ansible |
| Terraform state lost | Use snapshots or re-provision from scratch; code is in GitHub |

---

## 8. Cost and safety summary

| Provider | Monthly cost | Best practice |
|---|---|---|
| Oracle Cloud | €0 (Always Free) | Take boot-volume backups; watch the 50 GB boot volume limit per VM |
| Hetzner | ~€15 | Snapshots before demo; sync backups to object storage |

The safest demo is the one you can destroy and recreate from GitHub in under 15 minutes.
