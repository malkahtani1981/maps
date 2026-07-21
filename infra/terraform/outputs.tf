output "presenting_public_ip" {
  value       = hcloud_server.presenting.ipv4_address
  description = "Graph-presenting VM. Point your domain's A record here."
}

output "processing_public_ip" {
  value       = hcloud_server.processing.ipv4_address
  description = "Graph-processing VM (DB ports reachable only from the presenting VM)."
}

# Handy: generate the Ansible inventory from Terraform state
output "ansible_inventory" {
  value = <<-EOT
    [presenting]
    ${hcloud_server.presenting.ipv4_address}

    [processing]
    ${hcloud_server.processing.ipv4_address}

    [all:vars]
    ansible_user=root
    ansible_ssh_private_key_file=~/.ssh/maps_deploy
  EOT
}
