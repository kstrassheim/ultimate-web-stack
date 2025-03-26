variable app_name {
    description = "The environment to deploy the resources to"
    default     = "ultimate-web-stack"
    type        = string
}

variable resource_group_name {
    description = "The name of the resource group to deploy the resources to"
    default     = "ultimate-web-stack-dev"
    type        = string
}

variable deployment_user_managed_identity_name {
    description = "The name of the user managed identity that does the deployment"
    default     = "github-ultimate-web-stack-dev"
    type        = string
} 

variable env {
    description = "The environment to deploy the resources to"
    default     = "dev"
    type        = string
}

variable web_plan_sku {
    description = "Performance: The sku of the deployed application"
    default     = "F1"
    type        = string
}

variable web_instances_count {
    description = "Performance: The number of workers to run the application"
    default     = 1
    type        = number
}

