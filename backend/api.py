import jwt 
from fastapi import APIRouter, Security, HTTPException, Body
from pydantic import BaseModel
# from common import azure_scheme, scopes, logger
import logging
import requests
from common import tfconfig
from role_based_access import required_roles 
from token_validation import inject_security

api_router = APIRouter()

@api_router.get("/user-data")
@inject_security()
async def get_user_data():
    logger.info("User Api - Returning User data")
    return {"message": "Hello from API"}

# Define model for request body
class AdminDataRequest(BaseModel):
    message: str = "Default message"
    status: int = 200

# Changed from GET to POST and using request body
@api_router.post("/admin-data")
@inject_security()
@required_roles(["Admin"])
async def get_admin_data(request: AdminDataRequest = Body(...), token = None):
    logger.info(f"Admin API - Message: {request.message}, Status: {request.status}")
    
    # You can use the status parameter to simulate different responses
    if request.status >= 400:
        raise HTTPException(status_code=request.status, detail=request.message)
        
    return {
        "message": f"Hello Admin: {request.message}",
        "status": request.status,
        "received": True
    }