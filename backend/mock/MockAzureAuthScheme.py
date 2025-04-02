from fastapi import Request
import jwt

class MockAzureAuthScheme:
    def __init__(self, logger):
        self.logger = logger
        logger.info("Initializing MockAzureAuthScheme (with decode)")

    async def __call__(self, request: Request, security_scopes=None):
        self.logger.info("MockAzureAuthScheme called - decoding token without validation")

        # Grab the raw Authorization header
        auth_header = request.headers.get("Authorization", "")
        raw_token = ""

        # If there's a Bearer token, extract it
        if auth_header.startswith("Bearer "):
            raw_token = auth_header.replace("Bearer ", "")
            self.logger.info(f"MockAzureAuthScheme: Found Bearer token of length {len(raw_token)}")
        else:
            self.logger.info("MockAzureAuthScheme: No Bearer token found in headers")

        # Decode the token payload without verifying
        token_payload = {}
        if raw_token:
            try:
                token_payload = jwt.decode(raw_token, options={
                    "verify_signature": False,
                    "verify_aud": False,
                    "verify_exp": False
                })
                self.logger.info(f"MockAzureAuthScheme: Decoded token claims: {token_payload}")
            except Exception as e:
                self.logger.warning(f"MockAzureAuthScheme: Could not decode token - using an empty payload. Error: {str(e)}")

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