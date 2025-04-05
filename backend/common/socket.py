from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from jose import JWTError 
from common.auth import verify_token
from typing import List
from common.log import logger

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    # Connect without authentication
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    # Connect authenticated
    async def auth_connect(self, websocket: WebSocket, required_roles: List[str] = [], check_all: bool = False):
        await websocket.accept()

        # Wait for authentication message
        auth_data = await websocket.receive_json()
        
        if not auth_data.get("token"):
            logger.warning("WebSocket connection attempt with missing token")
            await websocket.close(code=1008, reason="Missing authentication token")
            return
            
        try:
            # Validate token from first message
            claims = verify_token(auth_data["token"], required_roles, check_all)
            
            if not claims:
                logger.warning("WebSocket connection attempt with invalid token (no claims)")
                await websocket.close(code=1008, reason="Invalid authentication token")
                return
                
        except HTTPException as e:
            if e.status_code == 403:
                logger.warning(f"Role check failed during WebSocket authentication: {e.detail}")
                await websocket.close(code=1008, reason="Insufficient permissions")
            else:
                logger.error(f"HTTP error during WebSocket authentication: {e.detail}")
                await websocket.close(code=1008, reason=e.detail)
            return
        except JWTError as e:
            logger.error(f"JWT Error during WebSocket authentication: {str(e)}")
            await websocket.close(code=1008, reason="Invalid authentication token")
            return
        except Exception as e:
            logger.error(f"Unexpected error during token verification: {str(e)}")
            await websocket.close(code=1011, reason="Authentication server error")
            return
        
        # Verify required fields exist in claims
        if not claims.get("sub"):
            logger.warning("WebSocket token missing required 'sub' claim")
            await websocket.close(code=1008, reason="Invalid token claims")
            return
        
        websocket.state.user = {
            "sub": claims.get("sub"),
            "name": claims.get("name", "unknown user"),
            "roles": claims.get("roles", [])
        }
        
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

    async def broadcast_except(self, message: str, exclude_websocket: WebSocket):
        for connection in self.active_connections:
            if connection != exclude_websocket:
                await connection.send_text(message)
                
    # New method to send JSON data with a username property
    async def send_data(self, data: dict, websocket: WebSocket):
        """
        Sends JSON data to the given websocket connection.
        Automatically includes a `username` property extracted from websocket.state.user.
        """
        username = "unknown"
        if hasattr(websocket.state, "user"):
            username = websocket.state.user.get("name", "unknown")
        data_with_username = {**data, "username": username}
        await websocket.send_json(data_with_username)
