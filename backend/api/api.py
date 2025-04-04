from fastapi import APIRouter, Security, HTTPException, Body, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from common.auth import azure_scheme, scopes
from common.log import logger
from common.role_based_access import required_roles
from common.socket import manager

api_router = APIRouter()

@api_router.get("/user-data")
async def get_user_data(token=Security(azure_scheme, scopes=scopes)):
    logger.info("User Api - Returning User data")
    return {"message": "Hello from API"}

# Define model for request body
class AdminDataRequest(BaseModel):
    message: str = "Default message"
    status: int = 200

# Changed from GET to POST and using request body
@api_router.post("/admin-data")
@required_roles(["Admin"])
async def get_admin_data(request: AdminDataRequest = Body(...), token=Security(azure_scheme, scopes=scopes)):
    logger.info(f"Admin API - Message: {request.message}, Status: {request.status}")
    
    # You can use the status parameter to simulate different responses
    if request.status >= 400:
        raise HTTPException(status_code=request.status, detail=request.message)
        
    return {
        "message": f"Hello Admin: {request.message}",
        "status": request.status,
        "received": True
    }

# WebSocket endpoint
@api_router.websocket("/chat")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.send_personal_message(f"You sent: {data}", websocket)
            await manager.broadcast_except(f"Client says: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast("A client disconnected")