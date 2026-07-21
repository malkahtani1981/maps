variable "project" {
  description = "Project slug used to name resources"
  type        = string
  default     = "maps"
}

variable "tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID"
  type        = string
}

variable "fingerprint" {
  description = "OCI API key fingerprint"
  type        = string
}

variable "private_key" {
  description = "OCI API private key contents (PEM). Used by CI. For local runs set private_key_path instead."
  type        = string
  sensitive   = true
  default     = ""
}

variable "private_key_path" {
  description = "Path to the OCI API private key file (local use only)."
  type        = string
  default     = ""
}

variable "compartment_ocid" {
  description = "OCI compartment OCID (defaults to tenancy root if not set)"
  type        = string
  default     = ""
}

variable "region" {
  description = "OCI region, e.g. us-ashburn-1, eu-frankfurt-1"
  type        = string
  default     = "us-ashburn-1"
}

variable "availability_domain" {
  description = "Availability domain within the region (e.g. AD-1). Leave empty to use the first AD automatically."
  type        = string
  default     = ""
}

variable "image_ocid" {
  description = "Optional OCID of a specific Ubuntu 24.04 image. Leave empty to auto-select the latest image."
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Public key for the deploy keypair (matches the private key in GitHub Actions secrets)"
  type        = string
}

# --- Always Free shapes ---
# Oracle Cloud Free Tier options:
#   VM.Standard.E2.1.Micro = 1/8 OCPU, 1 GB RAM (AMD) — Always Free, up to 2 instances
#   VM.Standard.A1.Flex   = Arm, flexible OCPU/RAM — Always Free up to 2 OCPUs + 12 GB RAM total
#
# Default below uses Ampere A1 split 1 OCPU + 6 GB per VM, which fits exactly in the free quota
# (1,500 OCPU hours and 9,000 GB hours per month).
variable "presenting_shape" {
  description = "Compute shape for the presenting VM"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "presenting_ocpus" {
  description = "OCPUs for the presenting VM"
  type        = number
  default     = 1
}

variable "presenting_memory_gbs" {
  description = "Memory (GB) for the presenting VM"
  type        = number
  default     = 6
}

variable "presenting_boot_volume_size" {
  description = "Boot volume size (GB) for the presenting VM"
  type        = number
  default     = 50
}

variable "processing_shape" {
  description = "Compute shape for the processing VM"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "processing_ocpus" {
  description = "OCPUs for the processing VM"
  type        = number
  default     = 1
}

variable "processing_memory_gbs" {
  description = "Memory (GB) for the processing VM"
  type        = number
  default     = 6
}

variable "processing_boot_volume_size" {
  description = "Boot volume size (GB) for the processing VM"
  type        = number
  default     = 50
}
