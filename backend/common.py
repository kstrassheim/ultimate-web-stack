from os import environ as os_environ, path as os_path
import threading
from fastapi_azure_auth.auth import SingleTenantAzureAuthorizationCodeBearer
import json
from opencensus.ext.azure.log_exporter import AzureLogHandler
import logging

tfconfig = None
with open("terraform.config.json", "r") as config_file:
    tfconfig = json.load(config_file)

def create_fixed_logger():
    logger = logging.getLogger(__name__)
    
    # Fix existing handlers
    for handler in logger.handlers:
        if handler.lock is None:
            handler.lock = threading.RLock()
    
    # Make sure there's an Azure handler with a proper lock
    if not any(isinstance(h, AzureLogHandler) for h in logger.handlers):
        azure_handler = AzureLogHandler(connection_string=tfconfig['application_insights_connection_string']['value'])
        azure_handler.lock = threading.RLock()  # Explicitly set lock
        logger.addHandler(azure_handler)
    
    return logger

# Replace the existing logger
logger = create_fixed_logger()

import logging
import threading

# define scope to use in the API   
scopes = [tfconfig["oauth2_permission_scope"]["value"]]

azure_scheme = None
mock_enabled = os_environ.get("MOCK", "false").lower() == "true"

# Print mock settings
from rich import print as rprint
from rich.console import Console
from rich.panel import Panel

if not mock_enabled:
    console = Console()
    console.print(Panel(f"MOCK [bold]DISABLED[/bold] passing real Azure Scheme", style="green"))
    azure_scheme = SingleTenantAzureAuthorizationCodeBearer(
        app_client_id=tfconfig["client_id"]["value"],  
        tenant_id=tfconfig["tenant_id"]["value"], 
        scopes={tfconfig["oauth2_permission_scope_uri"]["value"]: tfconfig["oauth2_permission_scope"]["value"]},
        allow_guest_users=True
    )
else:
    console = Console()
    console.print(Panel(f"MOCK: [bold]ENABLED[/bold] passing Mock azure scheme", style="yellow"))
    logger.info("MOCK environment is enabled")
    # Define mock authentication scheme
    # Assign the mock scheme
    from fastapi import Request
    import jwt

    class MockAzureAuthScheme:
        def __init__(self):
            logger.info("Initializing MockAzureAuthScheme (with decode)")

        async def __call__(self, request: Request, security_scopes=None):
            logger.info("MockAzureAuthScheme called - decoding token without validation")

            # Grab the raw Authorization header
            auth_header = request.headers.get("Authorization", "")
            raw_token = ""

            # If there's a Bearer token, extract it
            if auth_header.startswith("Bearer "):
                raw_token = auth_header.replace("Bearer ", "")
                logger.info(f"MockAzureAuthScheme: Found Bearer token of length {len(raw_token)}")
            else:
                logger.info("MockAzureAuthScheme: No Bearer token found in headers")

            # Decode the token payload without verifying
            token_payload = {}
            if raw_token:
                try:
                    token_payload = jwt.decode(raw_token, options={
                        "verify_signature": False,
                        "verify_aud": False,
                        "verify_exp": False
                    })
                    logger.info(f"MockAzureAuthScheme: Decoded token claims: {token_payload}")
                except Exception as e:
                    logger.warning(f"MockAzureAuthScheme: Could not decode token - using an empty payload. Error: {str(e)}")

            # Build a token object from the payload
            class DecodedToken:
                def __init__(self, claims: dict):
                    # Copy all claims as attributes
                    for key, value in claims.items():
                        setattr(self, key, value)
                    # Provide a default if "roles" not present
                    if not hasattr(self, "roles"):
                        self.roles = []

            return DecodedToken(token_payload)

    azure_scheme = MockAzureAuthScheme()
