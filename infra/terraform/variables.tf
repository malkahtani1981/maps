variable "project" {
  description = "Project slug used to name resources"
  type        = string
  default     = "maps"
}

variable "hcloud_token" {
  description = "Hetzner Cloud API token (supply via TF_VAR_hcloud_token / GitHub Actions secret)"
  type        = string
  sensitive   = true
}

variable "location" {
  description = "Hetzner location: fsn1/nbg1 (Germany), hel1 (Finland)"
  type        = string
  default     = "fsn1"
}

variable "image" {
  description = "OS image"
  type        = string
  default     = "ubuntu-24.04"
}

# Server type reference (Hetzner shared vCPU, x86):
#   cx22 = 2 vCPU / 4 GB  / 40 GB NVMe  ~ €4.5/mo
#   cx32 = 4 vCPU / 8 GB  / 80 GB NVMe  ~ €7.6/mo
#   cx42 = 8 vCPU / 16 GB / 160 GB NVMe ~ €15/mo
variable "presenting_server_type" {
  description = "Server type for the graph-presenting VM (Caddy, API, Redis, GraphHopper)"
  type        = string
  default     = "cx32"
}

variable "processing_server_type" {
  description = "Server type for the graph-processing VM (PostgreSQL/pgRouting, Memgraph, Spark batch)"
  type        = string
  default     = "cx32"
}

variable "ssh_public_key" {
  description = "Public key for the deploy keypair (matches the private key in GitHub Actions secrets)"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs allowed to SSH. Tighten to your IP and/or CI runner ranges."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}
