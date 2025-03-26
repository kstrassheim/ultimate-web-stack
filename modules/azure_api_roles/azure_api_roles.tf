module azure_resource_query {
  source = "./modules/azure_resource_query"
  sub_url = "v1.0/servicePrincipals"
  parameters = "&%24filter=appId%20eq%20'00000003-0000-0000-c000-000000000000'&&%24select=appRoles,oauth2PermissionScopes"
}
# REMARK you have to Assign Directory.Read.All to the application  or Azure AD "Directory Reader" permissions to the deployment pricipal for this to work
locals {
  api_permissions = module.azure_resource_query.response
  application_roles_dictionary = { 
    for role in flatten([ for obj in local.api_permissions.value : obj.appRoles  ]) : role.value => role.id 
  }
  application_roles_dictionary_reversed = { for friendly, id in local.application_roles_dictionary : id => friendly }
  user_roles_dictionary = merge(reverse([
      for role in flatten([
        for obj in local.api_permissions.value : obj.oauth2PermissionScopes
      ]) : { (role.value) = role.id }
    ])...
  )
  user_roles_dictionary_reversed = { for friendly, id in local.user_roles_dictionary : id => friendly }
}

output "all_api_permissions" {
  value = local.api_permissions
}

output "role_type_mapping" {
  value = { "Delegated" = "Scope", "Application" = "Role" }
}

output "application_roles_dictionary" {
  value = local.application_roles_dictionary
}

output "application_roles_dictionary_reversed" {
  value = local.application_roles_dictionary_reversed
}

output "user_roles_dictionary" {
  value = local.user_roles_dictionary
}

output "user_roles_dictionary_reversed" {
  value = local.user_roles_dictionary_reversed
}