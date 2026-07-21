terraform {
  required_version = ">= 1.6"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
  # Recommended: configure a remote backend for team/CI use.
  # backend "s3" { ... }
}

locals {
  compartment_ocid = var.compartment_ocid != "" ? var.compartment_ocid : var.tenancy_ocid
  private_key      = var.private_key != "" ? var.private_key : (var.private_key_path != "" ? file(var.private_key_path) : "")
}

provider "oci" {
  tenancy_ocid = var.tenancy_ocid
  user_ocid    = var.user_ocid
  fingerprint  = var.fingerprint
  private_key  = local.private_key
  region       = var.region
}

# ---------------------------------------------------------------------------
# Look up the latest Ubuntu 24.04 image in the region automatically
# ---------------------------------------------------------------------------
data "oci_core_images" "ubuntu" {
  compartment_id   = local.compartment_ocid
  operating_system = "Canonical Ubuntu"
  filter {
    name   = "display_name"
    values = ["Canonical-Ubuntu-24.04-*"]
    regex  = true
  }
  sort_by = "TIMECREATED"
  sort_order = "DESC"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = local.compartment_ocid
}

locals {
  image_ocid          = var.image_ocid != "" ? var.image_ocid : data.oci_core_images.ubuntu.images[0].id
  availability_domain = var.availability_domain != "" ? var.availability_domain : data.oci_identity_availability_domains.ads.availability_domains[0].name
}

# ---------------------------------------------------------------------------
# Virtual Cloud Network (VCN) and public subnet for the two graph VMs
# ---------------------------------------------------------------------------
resource "oci_core_vcn" "maps" {
  compartment_id = local.compartment_ocid
  display_name   = "${var.project}-vcn"
  cidr_block     = "10.0.0.0/16"
  dns_label      = var.project
}

resource "oci_core_internet_gateway" "maps" {
  compartment_id = local.compartment_ocid
  display_name   = "${var.project}-igw"
  vcn_id         = oci_core_vcn.maps.id
}

resource "oci_core_route_table" "maps_public" {
  compartment_id = local.compartment_ocid
  display_name   = "${var.project}-public-rt"
  vcn_id         = oci_core_vcn.maps.id

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.maps.id
  }
}

resource "oci_core_subnet" "maps_public" {
  compartment_id    = local.compartment_ocid
  display_name      = "${var.project}-public-subnet"
  vcn_id            = oci_core_vcn.maps.id
  cidr_block        = "10.0.1.0/24"
  route_table_id    = oci_core_route_table.maps_public.id
  security_list_ids = [oci_core_security_list.maps_public.id]
  dns_label         = "public"
}

resource "oci_core_security_list" "maps_public" {
  compartment_id = local.compartment_ocid
  display_name   = "${var.project}-public-sl"
  vcn_id         = oci_core_vcn.maps.id

  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
    description = "SSH"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
    description = "HTTP"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
    description = "HTTPS"
  }

  # Processing services: only the presenting VM subnet may connect.
  ingress_security_rules {
    protocol = "6" # TCP
    source   = oci_core_subnet.maps_public.cidr_block
    tcp_options {
      min = 5432
      max = 5432
    }
    description = "PostgreSQL / pgRouting"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = oci_core_subnet.maps_public.cidr_block
    tcp_options {
      min = 7687
      max = 7687
    }
    description = "Memgraph Bolt"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = oci_core_subnet.maps_public.cidr_block
    tcp_options {
      min = 9092
      max = 9092
    }
    description = "Kafka (extended profile)"
  }

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }
}

# ---------------------------------------------------------------------------
# Graph PRESENTING VM: Caddy (TLS) -> JSON API + Redis + GraphHopper
# ---------------------------------------------------------------------------
resource "oci_core_instance" "presenting" {
  availability_domain = local.availability_domain
  compartment_id      = local.compartment_ocid
  display_name        = "${var.project}-presenting"
  shape               = var.presenting_shape
  shape_config {
    ocpus         = var.presenting_ocpus
    memory_in_gbs = var.presenting_memory_gbs
  }
  source_details {
    source_type             = "image"
    source_id               = local.image_ocid
    boot_volume_size_in_gbs = var.presenting_boot_volume_size
  }
  create_vnic_details {
    subnet_id        = oci_core_subnet.maps_public.id
    assign_public_ip = true
  }
  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
  freeform_tags = { project = var.project, role = "presenting" }
}

# ---------------------------------------------------------------------------
# Graph PROCESSING VM: PostgreSQL + pgRouting, Memgraph, Spark batch jobs
# ---------------------------------------------------------------------------
resource "oci_core_instance" "processing" {
  availability_domain = local.availability_domain
  compartment_id      = local.compartment_ocid
  display_name        = "${var.project}-processing"
  shape               = var.processing_shape
  shape_config {
    ocpus         = var.processing_ocpus
    memory_in_gbs = var.processing_memory_gbs
  }
  source_details {
    source_type             = "image"
    source_id               = local.image_ocid
    boot_volume_size_in_gbs = var.processing_boot_volume_size
  }
  create_vnic_details {
    subnet_id        = oci_core_subnet.maps_public.id
    assign_public_ip = true
  }
  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
  freeform_tags = { project = var.project, role = "processing" }
}
