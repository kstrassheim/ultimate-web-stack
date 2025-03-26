variable "resource_url" {
  description = "The url of the resource to get the access token for. Default https://graph.microsoft.com"
  type = string 
  default = "https://graph.microsoft.com"
}

data "external" "graph_token" {
  program = [  
    "bash",
    "-c", 
    "az account get-access-token --resource '${var.resource_url}' --query '{accessToken: accessToken}' --output json"
    ]
}

output token {
  value = data.external.graph_token.result.accessToken
  sensitive = true
}