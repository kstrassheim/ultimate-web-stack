import jwt 
from fastapi import APIRouter, Security, HTTPException#, Depends, HTTPException, Header
from common import azure_scheme, scopes
import logging
import requests
from common import tfconfig, logger
from role_based_access import required_roles 

api_router = APIRouter()

@api_router.get("/user-data")
async def get_user_data(token=Security(azure_scheme, scopes=scopes)):
    logger.info("User Api - Returning User data")
    return {"message": "Hello from API"}


@api_router.get("/admin-data")
@required_roles(["Admin"])
async def get_admin_data(token=Security(azure_scheme, scopes=scopes)):
    # check_user_roles(token, ["Admin"])
    logger.info("Admin API - Returning response")
    return {"message": "Hello Admin"}