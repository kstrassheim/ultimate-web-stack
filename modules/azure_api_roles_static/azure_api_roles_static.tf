variable file {
  type        = string
  default     = "azure_api_roles.json"
  description = "Uses a static json file which contains all possible roles and permissions for the graph api. For compatibility it should be downloaded as JSON via https://graph.microsoft.com/v1.0/servicePrincipals?&%24filter=appId%20eq%20'00000003-0000-0000-c000-000000000000'&&%24select=appRoles,oauth2PermissionScopes'"
}

# REMARK you have to run azure_api_roles_quey.sh module to download the permissions and check them in into the repository

locals {
  api_permissions = jsondecode(file("${path.module}/${trim(trim(trim(var.file," "),"/"), "\\")}"))
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