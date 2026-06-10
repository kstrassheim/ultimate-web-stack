# Stop script execution on any error
$ErrorActionPreference = 'Stop'

# TODO check for az login
Write-Host "Initializing Frontend"
Push-Location .\frontend
npm install
npm run build
Pop-Location

Write-Host "Initializing Backend"
Push-Location .\backend
# Ensure uv is available
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}
# requirements.txt is the generated, hashed lock produced by
#     uv pip compile requirements.in --universal --generate-hashes --python-version 3.12 -o requirements.txt
# (see requirements.in for the hand-edited direct-dependency selector).
uv venv venv --python 3.12
$env:VIRTUAL_ENV = "$PWD\venv"
uv pip sync requirements.txt
Remove-Item Env:\VIRTUAL_ENV
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