output "app_public_ip" {
  value       = aws_lightsail_static_ip.app.ip_address
  description = "Point your domain's A record here (behind Cloudflare)."
}

output "data_public_ip" {
  value = aws_lightsail_static_ip.data.ip_address
}

output "assets_bucket" {
  value = aws_lightsail_bucket.assets.name
}

# Handy: generate the Ansible inventory from Terraform state
output "ansible_inventory" {
  value = <<-EOT
    [app]
    ${aws_lightsail_static_ip.app.ip_address}

    [data]
    ${aws_lightsail_static_ip.data.ip_address}

    [all:vars]
    ansible_user=ubuntu
    ansible_ssh_private_key_file=~/.ssh/maps_deploy
  EOT
}
