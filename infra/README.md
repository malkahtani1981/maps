# Maps — Infrastructure (Terraform + Ansible + GitHub Actions)

Production infra for the Al Ula / Saudi maps project on **AWS Lightsail (me-south-1, Bahrain)** — the lowest-cost AWS option that fits the routing stack (~$50/mo for two 2 vCPU / 4 GB VMs).

## Layout

```
infra/
├── terraform/          # 2 Lightsail VMs (app + data), static IPs, firewall, bucket
└── ansible/            # Hardening, Docker, and the two container stacks
.github/workflows/
├── infra.yml           # terraform fmt/validate/plan on PR; apply via manual dispatch
└── deploy.yml          # build API image → GHCR → ansible-playbook deploy on push to main
```

Topology:

- **app VM** — Caddy (auto-TLS) → JSON API + Redis + GraphHopper
- **data VM** — PostgreSQL + pgRouting, Memgraph (ports open only to the app VM)
- **Lightsail bucket** — photos/GeoJSON/backups

## One-time setup

1. **Generate a deploy key**: `ssh-keygen -t ed25519 -f ~/.ssh/maps_deploy -N ""`
2. **GitHub → repo Settings → Secrets and variables → Actions**, add secrets:
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (IAM user with Lightsail permissions)
   - `DEPLOY_SSH_PUBLIC_KEY`, `DEPLOY_SSH_PRIVATE_KEY` (from step 1)
   - `POSTGRES_PASSWORD`
   - `APP_HOST`, `DATA_HOST` (fill after first `terraform apply`)
   - Variable: `DOMAIN` (optional — enables automatic HTTPS via Caddy)
3. **Provision**: Actions → "Infrastructure (Terraform)" → Run workflow with `apply=true`
   (or locally: `cd infra/terraform && terraform init && terraform apply`)
4. Copy the IP outputs into `APP_HOST` / `DATA_HOST` secrets; point your domain's A record (via Cloudflare) at the app IP.
5. **Deploy**: push to `main` — the deploy workflow hardens the VMs, installs Docker, and starts both stacks.

## Local usage

```bash
cd infra/terraform
terraform init && terraform apply
terraform output ansible_inventory > ../ansible/inventory.ini

cd ../ansible
cp group_vars/all.yml.example group_vars/all.yml   # fill in values (gitignored)
ansible-playbook site.yml
```

## Cost (as provisioned)

| Resource | Monthly |
|---|---|
| 2× Lightsail medium (2 vCPU / 4 GB) | $48 |
| Static IPs (attached) | $0 |
| Lightsail bucket 5 GB | $1 |
| Cloudflare free, GHCR (public), Actions free tier | $0 |
| **Total** | **~$49/mo** |

Downsize both bundles or move to Hetzner/Oracle Free Tier by only changing `app_bundle_id`/`data_bundle_id` or reusing the Ansible half — the playbooks are provider-agnostic (any Ubuntu 24.04 host).

## Notes

- Data VM DB ports (5432, 7687) accept traffic **only from the app VM's static IP** (enforced in both Lightsail firewall and UFW).
- Nightly `pg_dump` backups with 7-day retention on the data VM; sync `/opt/maps/backups` to the bucket for off-site copies.
- Terraform state: local by default — uncomment the S3 backend block in `main.tf` for team/CI use.
