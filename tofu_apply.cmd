tofu apply -auto-approve
tofu output -json > output.json
copy output.json frontend\terraform.config.json
copy output.json backend\terraform.config.json
