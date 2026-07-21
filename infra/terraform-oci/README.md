# Oracle Cloud Infrastructure (OCI) Terraform

Deploys the same two-VM graph-processing / graph-presenting topology on **Oracle Cloud Free Tier**.

## Free-tier shape strategy

Oracle Cloud Free Tier Always Free compute (free for the life of the account, in the home region) includes:

- Up to 2 `VM.Standard.E2.1.Micro` AMD instances (1/8 OCPU, 1 GB RAM each)
- Ampere A1 `VM.Standard.A1.Flex` Arm resources up to 2 OCPUs and 12 GB RAM per month

This module defaults to **Ampere A1** split as:

| VM | Shape | OCPUs | RAM | Boot |
|---|---|---|---|---|
| `maps-presenting` | VM.Standard.A1.Flex | 1 | 6 GB | 50 GB |
| `maps-processing` | VM.Standard.A1.Flex | 1 | 6 GB | 50 GB |
| **Total** | | **2** | **12 GB** | 100 GB |

This fits exactly within the Always Free Ampere A1 quota: 1,500 OCPU hours and 9,000 GB hours per month for a 24/7 deployment.

> **Note:** Availability of Always Free shapes can vary by region and availability domain. If you get an "out of capacity" error, try another region/AD or use the paid tier.

## Required credentials

1. Create an OCI account at https://www.oracle.com/cloud/free/
2. In the OCI Console, create an API key: **Profile → User Settings → API Keys → Add API Key**
3. Note the **Tenancy OCID**, **User OCID**, **Fingerprint**, and download the private key

## Local usage

```bash
cd infra/terraform-oci
cp terraform.tfvars.example terraform.tfvars  # fill in OCIDs and keys
terraform init
terraform apply
terraform output -raw ansible_inventory > ../ansible/inventory.ini
cd ../ansible
ansible-playbook site.yml
```

## Default user

OCI Ubuntu images use the `ubuntu` user. The generated Ansible inventory uses `ansible_user=ubuntu`, and the playbook uses `become: true` so it can install Docker and configure the system.
