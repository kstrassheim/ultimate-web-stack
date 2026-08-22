tofu apply -auto-approve
tofu output -json > output.json
cp output.json frontend/terraform.config.json
cp output.json backend/terraform.config.json
