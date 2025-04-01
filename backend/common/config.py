import json
from os import environ as os_environ, path as os_path

mock_enabled = os_environ.get("MOCK", "false").lower() == "true"

# Choose the appropriate config file based on mock setting
config_path = "mock/terraform.mock.config.json" if mock_enabled else "terraform.config.json"
print(f"Loading configuration from: {config_path}")
tfconfig = None
try:
    with open(config_path, "r") as config_file:
        tfconfig = json.load(config_file)
except FileNotFoundError:
    # Fallback to checking if file exists relative to the script location
    script_dir = os_path.dirname(os_path.abspath(__file__))
    alt_config_path = os_path.join(script_dir, "..", config_path)
    with open(alt_config_path, "r") as config_file:
        tfconfig = json.load(config_file)

origins = ["http://localhost:5173", "http://localhost:5173/__cypress/", "http://localhost:8000"] if tfconfig["env"]["value"] == "dev" else []