terraform apply -auto-approve
terraform output -json > terraform_output.json
copy terraform_output.json frontend\terraform.config.json
copy terraform_output.json backend\terraform.config.json