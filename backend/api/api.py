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

# Create a manager instance with appropriate role configuration
chatConnectionManager = ConnectionManager(
    receiver_roles=[],  # Empty means anyone can connect
    sender_roles=[]     # Empty means anyone can send messages
)

# WebSocket endpoint
@api_router.websocket("/chat")
async def websocket_endpoint(websocket: WebSocket):
    try:
        # Connect with authentication - no required_roles parameter (defined in constructor)
        await chatConnectionManager.auth_connect(websocket)
        
        try:
            while True:
                data = await websocket.receive_text()
                user_name = websocket.state.user.get("name", "Unknown User")
                
                # SECURITY CHECK: Skip broadcasting authentication messages
                # Check if this is an authentication message
                if 'token' in data.lower() or 'authenticate' in data.lower():
                    # Send private warning
                    await chatConnectionManager.send_personal_message(
                        "!!! Security warning: Authentication data should not be sent in chat messages !!!", 
                        websocket
                    )
                    continue  # Skip further processing of this message

                # Send personal acknowledgment using send_personal_message (unchanged)
                await chatConnectionManager.send_personal_message(f"You sent: {data}", websocket)
                
                # Fix: Wrap the data in a dictionary with a "content" field
                await chatConnectionManager.broadcast(
                    data={"content": f"{user_name}: {data}"},
                    type="message",
                    sender_websocket=websocket,
                    skip_self=True  # Don't send to the sender
                )
        except WebSocketDisconnect:
            chatConnectionManager.disconnect(websocket)
            user_name = websocket.state.user.get("name", "Unknown User")
            
            # Broadcast leave message using the new format
            await chatConnectionManager.broadcast(
                data={"content": f"{user_name} left the chat"},
                type="message"
            )
            
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        if websocket in chatConnectionManager.active_connections:
            chatConnectionManager.disconnect(websocket)