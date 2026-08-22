terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.8"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.8"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.5"
    }
  }
  # Both values come from variables rather than -backend-config flags. This is
  # OpenTofu early evaluation: they resolve at `tofu init`, before state exists.
  # HashiCorp Terraform cannot parse it -- which is moot, since the encryption
  # block below already makes this project OpenTofu-only.
  backend "azurerm" {
    resource_group_name  = "terraform"
    storage_account_name = "mytofustates"
    container_name       = var.app_name         # blob container == project name
    key                  = "${var.env}.tfstate" # dev.tfstate / test.tfstate / prod.tfstate
    use_azuread_auth     = true
  }

  # ---------------------------------------------------------------------------
  # State encryption. A per-run AES-GCM data key is wrapped by the RSA key
  # `ultimate-web-stack` in the kv-mytofustates Key Vault, so key material never
  # leaves the vault. All three environments share that one key; each still has
  # its own state blob.
  #
  # use_oidc/use_cli/client_id/tenant_id must be block arguments -- this key
  # provider does NOT read ARM_USE_OIDC / ARM_USE_CLI / ARM_CLIENT_ID /
  # ARM_TENANT_ID from the environment the way the backend does. They default to
  # the Azure CLI so local runs work off `az login`; CI sets TF_VAR_use_oidc.
  #
  # MIGRATION: the `fallback` lets the first run per environment read the state
  # while it is still unencrypted and write it back encrypted. Remove the
  # fallback once dev, test and prod have each applied once, otherwise
  # unencrypted state stays acceptable indefinitely.
  # ---------------------------------------------------------------------------
  encryption {
    key_provider "azure_vault" "state" {
      vault_uri      = "https://kv-mytofustates.vault.azure.net"
      vault_key_name = var.app_name
      key_length     = 32

      use_oidc  = var.use_oidc
      use_cli   = !var.use_oidc
      client_id = var.arm_client_id
      tenant_id = var.arm_tenant_id
    }

    method "aes_gcm" "state" {
      keys = key_provider.azure_vault.state
    }

    method "unencrypted" "migrate" {}

    state {
      method = method.aes_gcm.state

      fallback {
        method = method.unencrypted.migrate
      }
    }

    plan {
      method = method.aes_gcm.state
    }
  }
}

provider "azurerm" {
  features {}
}

provider "random" {}

module "naming" {
  source  = "Azure/naming/azurerm"
  version = "0.4.3"
  prefix  = [var.app_name] # base prefix for the generated names
  suffix  = [var.env]      # Azure region (adjust as needed)
}