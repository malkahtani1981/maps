output "presenting_public_ip" {
  value       = oci_core_instance.presenting.public_ip
  description = "Graph-presenting VM. Point your domain's A record here."
}

output "processing_public_ip" {
  value       = oci_core_instance.processing.public_ip
  description = "Graph-processing VM (DB ports reachable only from the presenting VM via OCI security list)."
}

output "ansible_inventory" {
  value = <<-EOT
    [presenting]
    ${oci_core_instance.presenting.public_ip}

    [processing]
    ${oci_core_instance.processing.public_ip}

    [all:vars]
    ansible_user=ubuntu
    ansible_ssh_private_key_file=~/.ssh/maps_deploy
  EOT
}

output "free_tier_quota_note" {
  value = "Default shape uses VM.Standard.A1.Flex: 1 OCPU + 6 GB RAM per VM = 2 OCPU / 12 GB RAM total, which matches the Oracle Cloud Always Free Ampere A1 monthly quota (1,500 OCPU hours and 9,000 GB hours)."
}
