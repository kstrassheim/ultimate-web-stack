# Stop script execution on any error
$ErrorActionPreference = 'Stop'


Write-Host "Initializing Terraform"
# Uncomment if needed
terraform init
.\terraform_apply.cmd

# TODO check for az login
Write-Host "Initializing Frontend"
Push-Location .\frontend
npm install
npm run build
Pop-Location

Write-Host "Initializing Backend"
Push-Location .\backend
python -m venv venv
& .\venv\Scripts\pip.exe install -r requirements.txt
Pop-Location

# Check if the virtual environment exists
# Push-Location .\backend
# if (-not (Test-Path "venv")) {
#     Write-Host "Virtual environment 'venv' not found. Please create one first."
#     exit 1
# }
# if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
#     Write-Host "Virtual environment 'venv' not found. Please create one first."
#     exit 1
# }

# # Activate the virtual environment in a new shell
# Write-Host "Activating backend.. (type 'exit' to quit)"
# powershell -NoExit -Command "& .\venv\Scripts\Activate.ps1;"
# Pop-Location