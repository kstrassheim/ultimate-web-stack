terraform {
   required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"  # update to your preferred version
    }
  }
  backend "azurerm" {
    resource_group_name  = "terraform"      # the resource group where your storage account exists
    storage_account_name = "mytofustates"       # the name of your storage account (must be globally unique)
    container_name       = "entraid-web-auth-reference"                  # the name of the container in the storage account
    key                  = "dev.tfstate"        # In pipeline this will be changed to terraform init -backend-config="key=${{ inputs.environment }}.tfstate
    use_azuread_auth = true
  }
}

provider "azurerm" {
  features {}
}

module "naming" {
  source      = "Azure/naming/azurerm"
  version     = "0.4.2"
  prefix = [var.app_name]       # base prefix for the generated names
  suffix = [var.env]     # Azure region (adjust as needed)
}