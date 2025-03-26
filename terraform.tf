# get api role dictionaries
module api_roles {
  source = "./modules/azure_api_roles"
}

# Reference the resource group of this project
data "azurerm_resource_group" "rg" {
  name = var.resource_group_name   // name of your resource group
}

// Reference to assign the ownership to the app registration
data "azurerm_user_assigned_identity" "deploy_managed_identity" {
  name = var.deployment_user_managed_identity_name
  resource_group_name = data.azurerm_resource_group.rg.name
}

data "azuread_service_principal" "deploy_managed_identity_pricipal" {
  client_id = data.azurerm_user_assigned_identity.deploy_managed_identity.client_id
}

locals {
  # apply resouce naming conventions
  # remove environment from the name in prod
  planName = var.env == "prod" ? replace(replace(module.naming.app_service_plan.name, "_", "-"), "-prod", "") : replace(module.naming.app_service_plan.name, "_", "-")
  webName = var.env == "prod" ? replace(replace("${var.app_name}", "_", "-"), "-prod", "") : "${replace("${var.app_name}-${var.env}", "_", "-")}"
  insightsName = var.env == "prod" ? "${replace("${var.app_name}-insights", "_", "-")}" : "${replace("${var.app_name}-insights-${var.env}", "_", "-")}"
  appRegName = var.env == "prod" ? "${replace(var.app_name, "_", "-")}" : "${replace(var.app_name, "_", "-")}-${var.env}"
}

// Create an App Service Plan (Linux)
resource "azurerm_service_plan" "plan" {
  name                = local.planName
  #name                = module.naming.app_service_plan.name_unique
  resource_group_name = data.azurerm_resource_group.rg.name
  location            = data.azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = var.web_plan_sku 
}

resource "azurerm_linux_web_app" "web" {
  # remove prod fom website naming on prod
  name                = local.webName
  #name                = replace(module.naming.app_service.name,"_","-") # nomal naming with prod
  resource_group_name = data.azurerm_resource_group.rg.name
  location            = azurerm_service_plan.plan.location
  service_plan_id     = azurerm_service_plan.plan.id
  site_config {
    always_on = false # in free version, always_on is not supported
    application_stack {
        python_version = "3.12"
    }

    # Startup command for FASTAPI
    app_command_line  = "gunicorn --worker-class uvicorn.workers.UvicornWorker --timeout 600 --access-logfile '-' --error-logfile '-' main:app"
    
    # Health check configuration
    health_check_path = "/health"
    health_check_eviction_time_in_min = 10
  }

  # Add the telemetry instrumentation key as an app setting
  app_settings = {
    # "APPINSIGHTS_INSTRUMENTATIONKEY" = azurerm_application_insights.log.instrumentation_key
    // !!! IMPORTANT or python site will not build !!!
    "SCM_DO_BUILD_DURING_DEPLOYMENT"= true
  }
}

resource "azurerm_application_insights" "log" {
  name                = local.insightsName
  resource_group_name = data.azurerm_resource_group.rg.name
  location            = data.azurerm_resource_group.rg.location
  application_type    = "web"
}

# Create an App Registration for the Entra ID Logon managed by the frontend
resource "azuread_application" "reg" {
  # remove the name prod from the prod version
  display_name     = var.env == "prod" ? "${replace(var.app_name, "_", "-")}" : "${replace(var.app_name, "_", "-")}-${var.env}"
  logo_image       = filebase64("${path.module}/frontend/logo_src/${var.env}/logo.png")

  # !! ABSOLUTELY IMPORTANT OTHERWISE - IDENTIFIER HAS TO BE CONFIGURED IN SEPERATE OBJECT BELOW AND THIS HAS TO BE SET !!
  # !! OTHERWISE IT WILL RECREATE AGAIN AND AGAIN WITHOUT SETTING THE IDENTIFIER URI WHAT WILL DISABLE AUTHENTICATION FOR CLIENTS !!!
  lifecycle {
    ignore_changes = [
      identifier_uris,
    ]
  }
  
  # Assign the ownership to the deployment managed identity or you will get conflicts between local and pipeline deployments
  owners           = [data.azuread_service_principal.deploy_managed_identity_pricipal.object_id]
  // Single Tenant
  sign_in_audience = "AzureADMyOrg"

  api {
    mapped_claims_enabled          = true
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Allow the application to access the backend on behalf of the signed-in user."
      admin_consent_display_name = "Backend Access"
      enabled                    = true
      id                         = "96183846-204b-4b43-82e1-5d2222eb4b9b"
      type                       = "User"
      user_consent_description   = "Allow the application to access backend on your behalf."
      user_consent_display_name  = "Backend Access"
      value                      = "user_impersonation"
    }
  }

  ## App Roles to Control access to the application
  app_role {
    allowed_member_types = ["User", "Application"]
    description          = "Admins can manage roles and perform all task actions"
    display_name         = "Admin"
    enabled              = true
    id                   = "1b19509b-32b1-4e9f-b71d-4992aa991967"
    value                = "admin"
  }

  app_role {
    allowed_member_types = ["User"]
    description          = "ReadOnly roles have limited query access"
    display_name         = "ReadOnly"
    enabled              = true
    id                   = "497406e4-012a-4267-bf18-45a1cb148a01"
    value                = "User"
  }

  feature_tags {
    # enable this app to be visible as enterprise application and in gallery
    enterprise = true
    gallery    = true
  }

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    resource_access {
      id   = lookup(module.api_roles.user_roles_dictionary,"User.Read.All")
      type = lookup(module.api_roles.role_type_mapping, "Delegated")
    }

    resource_access {
      id   = lookup(module.api_roles.user_roles_dictionary,"Group.Read.All")
      type = lookup(module.api_roles.role_type_mapping, "Delegated")
    }

    # IF APPLICATION ROLES ARE NEEDED - hERE NOT REALLY
    # resource_access {
    #   id   = lookup(module.api_roles.application_roles_dictionary,"Directory.Read.All")
    #   type = lookup(module.api_roles.role_type_mapping, "Application")
    # }
  }

  # Add a single-page application block
  single_page_application {
    redirect_uris = var.env == "dev" ? ["https://${azurerm_linux_web_app.web.default_hostname}/", "http://localhost:8000/", "http://localhost:5173/"] : ["https://${azurerm_linux_web_app.web.default_hostname}/"]
  }
}

resource "azuread_application_identifier_uri" "app_identifier" {
  application_id = azuread_application.reg.id
  identifier_uri = "api://${azuread_application.reg.client_id}"
}

# Generate Enterprise Application (Prinicpal) out of App Registration 
resource "azuread_service_principal" "enterprise" {
  client_id = azuread_application.reg.client_id

  # Allow only assigned users to login to this application
  app_role_assignment_required  = true
}