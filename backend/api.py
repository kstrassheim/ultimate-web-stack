import jwt 
from fastapi import APIRouter, Security, HTTPException#, Depends, HTTPException, Header
from common import azure_scheme, scopes
import logging
import requests
from common import tfconfig, logger

api_router = APIRouter()
# Validate if user is in specific role
def check_user_roles(token, required_roles):
    logger.info("Role check - Checking roles for expected", required_roles)
    if not token:
        http_ex = HTTPException(status_code=401, detail="Token is missing or invalid")
        logger.error(http_ex)
        raise http_ex
    roles = getattr(token, "roles", None)
    if roles is None:
        http_ex = HTTPException(status_code=403, detail="Roles are missing in the token")
        logger.error(http_ex)
        raise http_ex

    normalized_roles = [role.lower() for role in roles]
    normalized_required_roles = [role.lower() for role in required_roles]
    
    if not any(role in normalized_roles for role in normalized_required_roles):
        http_ex = HTTPException(status_code=403, detail="You do not have access to this resource")
        raise http_ex
    logger.info("Role check - Role check successfull")

@api_router.get("/user-data")
async def get_user_data(token=Security(azure_scheme, scopes=scopes)):
    logger.info("User Api - Returning User data")
    return {"message": "Hello from API"}


@api_router.get("/admin-data")
async def get_admin_data(token=Security(azure_scheme, scopes=scopes)):
    check_user_roles(token, ["Admin"])
    logger.info("Admin API - Returning response")
    return {"message": "Hello Admin"}