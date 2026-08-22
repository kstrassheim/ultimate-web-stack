variable "app_name" {
  description = "The environment to deploy the resources to"
  default     = "ultimate-web-stack"
  type        = string
}

variable "env" {
  description = "The environment to deploy the resources to"
  default     = "dev"
  type        = string
}

variable "web_plan_sku" {
  description = "Performance: The sku of the deployed application"
  default     = "F1"
  type        = string
}

variable "web_instances_count" {
  description = "Performance: The number of workers to run the application"
  default     = 1
  type        = number
}

variable "use_oidc" {
  description = <<-EOT
    Authenticate the azure_vault state-encryption key provider with a GitHub
    OIDC token instead of the Azure CLI. Defaults to false so local runs use
    your `az login` session; CI sets TF_VAR_use_oidc=true.
  EOT
  type        = bool
  default     = false
}

variable "arm_client_id" {
  description = "Client ID for the key provider when use_oidc is true. Empty locally; CI sets TF_VAR_arm_client_id."
  type        = string
  default     = ""
}

variable "arm_tenant_id" {
  description = "Tenant ID for the key provider when use_oidc is true. Empty locally; CI sets TF_VAR_arm_tenant_id."
  type        = string
  default     = ""
}
