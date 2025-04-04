from fastapi import APIRouter, Security, HTTPException, Body, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from common.auth import azure_scheme, scopes
from common.log import logger
from common.role_based_access import required_roles
from common.socket import ConnectionManager

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

# Create a manager instance
chatConnectionManager = ConnectionManager()

# WebSocket endpoint
@api_router.websocket("/chat")
async def websocket_endpoint(websocket: WebSocket):
    try:
        # connect with authentication
        await chatConnectionManager.auth_connect(websocket)
        
        try:
            while True:
                data = await websocket.receive_text()
                # Include user info in messages
                user_name = websocket.state.user.get("name")
                await chatConnectionManager.send_personal_message(f"You sent: {data}", websocket)
                await chatConnectionManager.broadcast_except(f"{user_name}: {data}", websocket)
        except WebSocketDisconnect:
            chatConnectionManager.disconnect(websocket)
            await chatConnectionManager.broadcast(f"{user_name} has left the chat")
            
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
        if websocket in chatConnectionManager.active_connections:
            chatConnectionManager.disconnect(websocket)