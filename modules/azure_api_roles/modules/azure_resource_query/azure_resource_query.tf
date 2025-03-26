variable "base_url" {
  description = "The url of the resource to query. Default is https://graph.microsoft.com"
  type = string 
  default = "https://graph.microsoft.com"
}

variable "sub_url" {
  description = "The url of the resource to query. Default is v1.0/users"
  type = string 
  default = "v1.0/users"
}

variable "parameters" {
  description = "The parameters to the query. Must be url encoded. Like %24select=param1,param2, Default is &%24select=userPrincipalName"
  type = string 
  default = "&%24select=userPrincipalName"
}

module "azure_access_token" {
  source = "./modules/azure_access_token"
  resource_url = var.base_url
}

data "http" "azure_resource_query" {
  # use the access token from the resources
  url = "${trim(trim(var.base_url," "),"/")}/${trim(trim(trim(var.sub_url," "),"?"),"/")}?${trim(trim(trim(var.parameters," "),"?"),"/")}"  
  request_headers = {
    "Authorization" = "Bearer ${module.azure_access_token.token}" #data.external.az_cli_token.result.accessToken}" ${var.token}"
    "Content-Type"  = "application/json"
  }
}

output "response" {
  value = jsondecode(data.http.azure_resource_query.response_body)
}