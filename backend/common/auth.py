from os import environ as os_environ, path as os_path
from fastapi_azure_auth.auth import SingleTenantAzureAuthorizationCodeBearer
from common.config import tfconfig, mock_enabled
from common.log import logger
from jose import JWTError, jwt  # Add JWTError import
from fastapi import HTTPException, status
import requests

# Before the verify_token function, initialize the JWKS client

# define scope to use in the API   
scopes = [tfconfig["oauth2_permission_scope"]["value"]]

azure_scheme = None

# Print mock settings
from rich import print as rprint
from rich.console import Console
from rich.panel import Panel

# dont apply mock on other environment than dev and only if mock_enabled is set to true
if tfconfig["env"]["value"] != "dev" or not mock_enabled:
    console = Console()
    console.print(Panel(f"MOCK [bold]DISABLED[/bold] passing real Azure Scheme", style="green"))
    azure_scheme = SingleTenantAzureAuthorizationCodeBearer(
        app_client_id=tfconfig["client_id"]["value"],  
        tenant_id=tfconfig["tenant_id"]["value"], 
        scopes={tfconfig["oauth2_permission_scope_uri"]["value"]: tfconfig["oauth2_permission_scope"]["value"]},
        allow_guest_users=True
    )
else:
    from mock.MockAzureAuthScheme import MockAzureAuthScheme
    console = Console()
    console.print(Panel(f"MOCK: [bold]ENABLED[/bold] passing Mock azure scheme", style="yellow"))
    logger.info("MOCK environment is enabled")
    # Define mock authentication scheme
    # Assign the mock scheme
 

    azure_scheme = MockAzureAuthScheme(logger)


def verify_token(token: str):
    """Verify a JWT token and return its claims"""
    try:
        # Use the same condition pattern for consistency
        if tfconfig["env"]["value"] != "dev" or not mock_enabled:
            # For real Azure auth, manually verify the token
            # Get the JWKS URL for your tenant
            jwks_url = f"https://login.microsoftonline.com/{tfconfig['tenant_id']['value']}/discovery/v2.0/keys"
            
            # Extract unverified headers to get the kid
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            
            # Get the JWKS
            jwks_response = requests.get(jwks_url)
            jwks = jwks_response.json()
            
            # Find the signing key
            signing_key = None
            for key in jwks["keys"]:
                if key["kid"] == kid:
                    signing_key = key
                    break
                    
            if not signing_key:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unable to find appropriate key for token validation",
                    headers={"WWW-Authenticate": "Bearer"},
                )
                
            # Verify the token
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience=tfconfig["client_id"]["value"]
            )
            
            return claims
        else:
            # Mock implementation
            logger.warning("MOCK TOKEN VERIFICATION: Accepting any token without validation")
            try:
                # Try to decode the token without verification
                # This will work for valid JWT format tokens
                parts = token.split('.')
                if len(parts) == 3:  # Proper JWT format (header.payload.signature)
                    import base64
                    import json
                    
                    # Decode the payload (middle part)
                    # Fix padding for base64 decoding
                    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
                    decoded = base64.b64decode(padded.replace('-', '+').replace('_', '/'))
                    claims = json.loads(decoded)
                    
                    # Ensure minimum required claims exist
                    if not claims.get("sub"):
                        claims["sub"] = "mock-subject-id"
                    if not claims.get("name"):
                        claims["name"] = "Mock User"
                    if not claims.get("roles"):
                        claims["roles"] = ["User"]
                        
                    logger.info(f"Mock token decoded with claims: {claims}")
                    return claims
                else:
                    # For non-JWT format tokens, return a mock object
                    return {
                        "sub": "mock-subject-id",
                        "name": "Mock User",
                        "roles": ["User"],
                        "aud": tfconfig["client_id"]["value"],
                        "iss": f"https://login.microsoftonline.com/{tfconfig['tenant_id']['value']}/v2.0",
                        "mock_generated": True
                    }
            except Exception as e:
                logger.warning(f"Failed to decode mock token, using default: {str(e)}")
                # Return default mock claims if token couldn't be decoded
                return {
                    "sub": "mock-subject-id",
                    "name": "Mock User",
                    "roles": ["User"],
                    "mock_generated": True
                }
            
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to validate token",
            headers={"WWW-Authenticate": "Bearer"},
        )
