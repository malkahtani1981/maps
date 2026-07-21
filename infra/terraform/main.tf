terraform {
  required_version = ">= 1.6"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
  }
  # Recommended: remote state (S3-compatible, e.g. Hetzner Object Storage or Backblaze B2).
  # backend "s3" { ... }
}

provider "hcloud" {
  token = var.hcloud_token
}

# ---------------------------------------------------------------------------
# SSH key used by Ansible / GitHub Actions to reach the servers
# ---------------------------------------------------------------------------
resource "hcloud_ssh_key" "deploy" {
  name       = "${var.project}-deploy"
  public_key = var.ssh_public_key
}

# ---------------------------------------------------------------------------
# Graph PRESENTING VM: Caddy (TLS) -> JSON API + Redis + GraphHopper + frontend
# ---------------------------------------------------------------------------
resource "hcloud_server" "presenting" {
  name        = "${var.project}-presenting"
  server_type = var.presenting_server_type
  image       = var.image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.deploy.id]
  labels      = { project = var.project, role = "presenting" }

  firewall_ids = [hcloud_firewall.presenting.id]
}

resource "hcloud_firewall" "presenting" {
  name = "${var.project}-presenting-fw"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.ssh_allowed_cidrs
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ---------------------------------------------------------------------------
# Graph PROCESSING VM: PostgreSQL + pgRouting, Memgraph, Spark batch jobs
# DB ports (5432, 7687) accept traffic only from the presenting VM.
# ---------------------------------------------------------------------------
resource "hcloud_server" "processing" {
  name        = "${var.project}-processing"
  server_type = var.processing_server_type
  image       = var.image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.deploy.id]
  labels      = { project = var.project, role = "processing" }

  firewall_ids = [hcloud_firewall.processing.id]
}

resource "hcloud_firewall" "processing" {
  name = "${var.project}-processing-fw"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.ssh_allowed_cidrs
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "5432" # PostgreSQL / pgRouting
    source_ips = ["${hcloud_server.presenting.ipv4_address}/32"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "7687" # Memgraph / Bolt
    source_ips = ["${hcloud_server.presenting.ipv4_address}/32"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "9092" # Kafka (extended educational profile)
    source_ips = ["${hcloud_server.presenting.ipv4_address}/32"]
  }
}
