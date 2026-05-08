resource "azurerm_cosmosdb_account" "db_account" {
  name = replace(
    var.env == "prod" ? "${var.app_name}-cosmos" : "${var.app_name}-cosmos-${var.env}",
    "_",
    "-"
  )
  location            = data.azurerm_resource_group.rg.location
  resource_group_name = data.azurerm_resource_group.rg.name

  offer_type = "Standard"
  kind       = "GlobalDocumentDB"

  public_network_access_enabled     = true
  is_virtual_network_filter_enabled = false

  capabilities {
    name = "EnableServerless"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = data.azurerm_resource_group.rg.location
    failover_priority = 0
  }

  local_authentication_disabled = true
}

resource "azurerm_cosmosdb_sql_database" "db" {
  name                = "app-database"
  resource_group_name = data.azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.db_account.name
}

resource "azurerm_cosmosdb_sql_container" "container" {
  name                  = "data"
  resource_group_name   = data.azurerm_resource_group.rg.name
  account_name          = azurerm_cosmosdb_account.db_account.name
  database_name         = azurerm_cosmosdb_sql_database.db.name
  partition_key_paths   = ["/type"]
  partition_key_version = 2
}

resource "random_uuid" "app_service_container_data_contributor" {}

resource "azurerm_cosmosdb_sql_role_assignment" "app_service_container_data_contributor" {
  name                = random_uuid.app_service_container_data_contributor.result
  resource_group_name = data.azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.db_account.name
  scope               = "${azurerm_cosmosdb_account.db_account.id}/dbs/${azurerm_cosmosdb_sql_database.db.name}/colls/${azurerm_cosmosdb_sql_container.container.name}"
  # Built-in Cosmos DB Data Contributor role for read/write access
  role_definition_id = "${azurerm_cosmosdb_account.db_account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002"
  principal_id       = azurerm_linux_web_app.web.identity[0].principal_id
}

resource "random_uuid" "app_service_account_data_reader" {}

resource "azurerm_cosmosdb_sql_role_assignment" "app_service_account_data_reader" {
  name                = random_uuid.app_service_account_data_reader.result
  resource_group_name = data.azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.db_account.name
  scope               = azurerm_cosmosdb_account.db_account.id
  # Built-in Cosmos DB Data Reader role grants account metadata read access
  role_definition_id = "${azurerm_cosmosdb_account.db_account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000001"
  principal_id       = azurerm_linux_web_app.web.identity[0].principal_id
}

resource "random_uuid" "deploy_managed_identity_owner_assignment" {}

resource "azurerm_cosmosdb_sql_role_assignment" "deploy_managed_identity_owner" {
  name                = random_uuid.deploy_managed_identity_owner_assignment.result
  resource_group_name = data.azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.db_account.name
  scope               = azurerm_cosmosdb_account.db_account.id
  # Custom Cosmos DB role granting full account-level permissions for admins
  role_definition_id = azurerm_cosmosdb_sql_role_definition.local_data_admin_owner.id
  principal_id       = data.azuread_service_principal.deploy_managed_identity_pricipal.object_id
}
