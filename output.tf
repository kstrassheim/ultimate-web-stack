output "env" {
  value       = var.env
  description = "The current deployment environment"
}

output "app_name" {
  value       = var.app_name
  description = "The name of the application"
}

output "web_app_name" {
  value       = azurerm_linux_web_app.web.name
  description = "The name of the web application"
}

output "web_url" {
  value       = "https://${azurerm_linux_web_app.web.default_hostname}"
  description = "The URL of the deployed web app"
}

output "application_insights_instrumentation_key" {
  value = nonsensitive(azurerm_application_insights.log.instrumentation_key)
}

output "application_insights_connection_string" {
  description = "The connection string for Application Insights"
  value       = nonsensitive(azurerm_application_insights.log.connection_string)
}

output "client_id" {
  description = "The Client ID for logon"
  value       = azuread_application.reg.client_id
}

output "tenant_id" {
  description = "The Tenant for the logon"
  value       = azuread_service_principal.enterprise.application_tenant_id
}

output "oauth2_permission_scope_uri" {
  description = "The full URI for the defined OAuth2 permission scope"
  value       = "api://${azuread_application.reg.client_id}/${tolist(azuread_application.reg.api[0].oauth2_permission_scope)[0].value}"
}

output "oauth2_permission_scope" {
  description = "The OAuth2 permission scope"
  value       = tolist(azuread_application.reg.api[0].oauth2_permission_scope)[0].value
}

output "app_roles_allowed_member_types_list" {
  description = "List of allowed member types for each app role"
  value = join(", ", distinct(flatten([
    for role in azuread_application.reg.app_role : tolist(role.allowed_member_types)
  ])))
}

output "requested_graph_api_delegated_permissions" {
  value = distinct(compact(flatten([
    for rra in azuread_application.reg.required_resource_access : [
      for ra in rra.resource_access : ra.type == "Scope" ? lookup(module.api_roles.user_roles_dictionary_reversed, ra.id, "unknown") : null
    ]
  ])))
}

output "requested_graph_api_application_permissions" {
  value = distinct(compact(flatten([
    for rra in azuread_application.reg.required_resource_access : [
      for ra in rra.resource_access : ra.type == "Role" ? lookup(module.api_roles.application_roles_dictionary_reversed, ra.id, "unknown") : null
    ]
  ])))
}

output "resource_group_name" {
  value       = data.azurerm_resource_group.rg.name
  description = "The name of the resource group"
}

output "cosmos_account_endpoint" {
  description = "Primary Cosmos DB account endpoint URI"
  value       = azurerm_cosmosdb_account.db_account.endpoint
}

output "cosmos_account_hostname" {
  description = "Cosmos DB account hostname for direct SDK connections"
  value       = "${azurerm_cosmosdb_account.db_account.name}.documents.azure.com"
}

output "cosmos_account_hostname_regional" {
  description = "Region-specific Cosmos DB account hostname"
  value       = "${azurerm_cosmosdb_account.db_account.name}-${azurerm_cosmosdb_account.db_account.location}.documents.azure.com"
}

output "cosmos_database_name" {
  description = "The Cosmos DB database (SQL API) name"
  value       = azurerm_cosmosdb_sql_database.db.name
}

output "cosmos_container_name" {
  description = "The Cosmos DB container (SQL API) name"
  value       = azurerm_cosmosdb_sql_container.container.name
} 