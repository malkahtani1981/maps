variable "project" {
  description = "Project slug used to name resources"
  type        = string
  default     = "maps"
}

variable "region" {
  description = "AWS region. me-south-1 = Bahrain (closest to Saudi Arabia)."
  type        = string
  default     = "me-south-1"
}

variable "blueprint_id" {
  description = "Lightsail OS blueprint"
  type        = string
  default     = "ubuntu_24_04"
}

# Bundle price reference (Lightsail, Linux):
#   medium_3_0 = 2 vCPU / 4 GB  / 80 GB SSD  ~ $24/mo  (minimum for routing engines)
#   large_3_0  = 2 vCPU / 8 GB  / 160 GB SSD ~ $44/mo
#   xlarge_3_0 = 4 vCPU / 16 GB / 320 GB SSD ~ $84/mo
variable "app_bundle_id" {
  description = "Bundle for the app VM (API + Redis + routing engine)"
  type        = string
  default     = "medium_3_0"
}

variable "data_bundle_id" {
  description = "Bundle for the data VM (Postgres/pgRouting + Memgraph)"
  type        = string
  default     = "medium_3_0"
}

variable "ssh_public_key" {
  description = "Public key for the deploy keypair (matches the private key in GitHub Actions secrets)"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDRs allowed to SSH. Tighten to your IP and/or GitHub Actions runner ranges."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
