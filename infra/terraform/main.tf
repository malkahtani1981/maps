terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Recommended: remote state. Create the bucket once, then uncomment.
  # backend "s3" {
  #   bucket = "maps-terraform-state-<your-suffix>"
  #   key    = "lightsail/terraform.tfstate"
  #   region = "me-south-1"
  # }
}

provider "aws" {
  region = var.region
}

# ---------------------------------------------------------------------------
# SSH key used by Ansible / GitHub Actions to reach the instances
# ---------------------------------------------------------------------------
resource "aws_lightsail_key_pair" "deploy" {
  name       = "${var.project}-deploy"
  public_key = var.ssh_public_key
}

# ---------------------------------------------------------------------------
# App VM: JSON API + Redis + GraphHopper/OSRM
# ---------------------------------------------------------------------------
resource "aws_lightsail_instance" "app" {
  name              = "${var.project}-app"
  availability_zone = "${var.region}a"
  blueprint_id      = var.blueprint_id
  bundle_id         = var.app_bundle_id
  key_pair_name     = aws_lightsail_key_pair.deploy.name

  tags = { project = var.project, role = "app" }
}

resource "aws_lightsail_static_ip" "app" {
  name = "${var.project}-app-ip"
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name
}

resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = var.ssh_allowed_cidrs
  }
  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
  }
  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
  }
}

# ---------------------------------------------------------------------------
# Data VM: PostgreSQL + pgRouting + Memgraph
# ---------------------------------------------------------------------------
resource "aws_lightsail_instance" "data" {
  name              = "${var.project}-data"
  availability_zone = "${var.region}a"
  blueprint_id      = var.blueprint_id
  bundle_id         = var.data_bundle_id
  key_pair_name     = aws_lightsail_key_pair.deploy.name

  tags = { project = var.project, role = "data" }
}

resource "aws_lightsail_static_ip" "data" {
  name = "${var.project}-data-ip"
}

resource "aws_lightsail_static_ip_attachment" "data" {
  static_ip_name = aws_lightsail_static_ip.data.name
  instance_name  = aws_lightsail_instance.data.name
}

# Data VM: SSH only from allowed CIDRs; DB ports only from the app VM.
resource "aws_lightsail_instance_public_ports" "data" {
  instance_name = aws_lightsail_instance.data.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = var.ssh_allowed_cidrs
  }
  port_info {
    protocol  = "tcp"
    from_port = 5432
    to_port   = 5432
    cidrs     = ["${aws_lightsail_static_ip.app.ip_address}/32"]
  }
  port_info {
    protocol  = "tcp"
    from_port = 7687 # Memgraph/Bolt
    to_port   = 7687
    cidrs     = ["${aws_lightsail_static_ip.app.ip_address}/32"]
  }
}

# ---------------------------------------------------------------------------
# Object storage bucket for user photos / GeoJSON / backups
# ---------------------------------------------------------------------------
resource "aws_lightsail_bucket" "assets" {
  name      = "${var.project}-assets"
  bundle_id = "small_1_0" # 5 GB, $1/mo — resize as needed
  tags      = { project = var.project }
}
