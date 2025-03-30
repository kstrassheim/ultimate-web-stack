terraform apply -auto-approve
terraform output -json > terraform_output.json
cp terraform_output.json frontend/terraform.config.json
cp terraform_output.json backend/terraform.config.json