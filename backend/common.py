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
azure_scheme = SingleTenantAzureAuthorizationCodeBearer(
    app_client_id=tfconfig["client_id"]["value"],  
    tenant_id=tfconfig["tenant_id"]["value"], 
    scopes={tfconfig["oauth2_permission_scope_uri"]["value"]: tfconfig["oauth2_permission_scope"]["value"]},
    allow_guest_users=True
)