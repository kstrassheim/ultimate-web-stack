from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from jose import JWTError 
from common.auth import verify_token
from typing import List
from common.log import logger
import datetime

# WebSocket connection manager
class ConnectionManager:
    def __init__(
        self, 
        receiver_roles: List[str] = [], 
        sender_roles: List[str] = [], 
        check_all: bool = False
    ):
        """Initialize a connection manager with role-based permissions
        
        Args:
            receiver_roles: Roles allowed to connect and receive data
            sender_roles: Roles allowed to send data via this WebSocket
            check_all: If True, require all roles; if False, any matching role is sufficient
        """
        self.active_connections: list[WebSocket] = []
        self.receiver_roles = receiver_roles
        self.sender_roles = sender_roles
        self.check_all = check_all

    # Connect without authentication
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    # Connect authenticated - now validating receiver roles
    async def auth_connect(self, websocket: WebSocket):
        await websocket.accept()

        # Wait for authentication message
        auth_data = await websocket.receive_json()
        
        if not auth_data.get("token"):
            logger.warning("WebSocket connection attempt with missing token")
            await websocket.close(code=1008, reason="Missing authentication token")
            return
            
        try:
            # Validate token against receiver roles to allow connection
            claims = verify_token(auth_data["token"], self.receiver_roles, self.check_all)
            
            if not claims:
                logger.warning("WebSocket connection attempt with invalid token (no claims)")
                await websocket.close(code=1008, reason="Invalid authentication token")
                return
                
        except HTTPException as e:
            if e.status_code == 403:
                logger.warning(f"Receiver role check failed during WebSocket authentication: {e.detail}")
                await websocket.close(code=1008, reason="Insufficient permissions to receive data")
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

    # Validate sender roles before allowing message sending
    def _validate_sender_roles(self, websocket: WebSocket) -> bool:
        """Validate if the websocket user has appropriate sender roles
        
        Returns:
            bool: True if user has permission to send, False otherwise
        """
        if not self.sender_roles:  # If no sender roles defined, allow all
            return True
            
        user_roles = websocket.state.user.get("roles", [])
        
        # Convert roles to lowercase for case-insensitive comparison
        normalized_user_roles = [role.lower() for role in user_roles]
        normalized_sender_roles = [role.lower() for role in self.sender_roles]
        
        # Check if user has required roles based on check_all flag
        if self.check_all:
            # Need all sender roles
            return all(role in normalized_user_roles for role in normalized_sender_roles)
        else:
            # Need any sender role
            return any(role in normalized_user_roles for role in normalized_sender_roles)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        # Sender role validation not required for personal messages
        # as the user is sending to themselves
        await websocket.send_text(message)
                
    # New method to send JSON data with a username property and type
    async def send(self, data: dict, type: str, websocket: WebSocket, sender_websocket: WebSocket = None):
        """
        Sends JSON data to the given websocket connection with a CRUD operation type.
        
        Args:
            data: The data payload to send
            type: Type of operation ("create", "update", "delete") 
            websocket: The WebSocket connection to send to
            sender_websocket: The WebSocket that initiated the data send, will be checked for sender roles
        
        Automatically includes:
        - `username` property extracted from websocket.state.user
        - `type` to indicate the CRUD operation
        """
        # Validate sender permission if a sender is provided
        if sender_websocket and not self._validate_sender_roles(sender_websocket):
            logger.warning(f"Data send attempt from user without sender role: {sender_websocket.state.user.get('name')}")
            return
            
            # Validate type
        valid_types = ["message", "create", "update", "delete"]
        if type not in valid_types:
            raise ValueError(f"Invalid type parameter: '{type}'. Must be one of: {', '.join(valid_types)}")
            
        username = "unknown"
        if hasattr(websocket.state, "user"):
            username = websocket.state.user.get("name", "unknown")
        
        # Add current timestamp in ISO format
        current_time = datetime.datetime.now().isoformat()

        data_with_metadata = {
            **data, 
            "username": username,
            "type": type,
            "timestamp": current_time
        }
        
        await websocket.send_json(data_with_metadata)

    async def broadcast(self, data: dict, type: str, sender_websocket: WebSocket = None, skip_self: bool = True):
        """
        Broadcasts JSON data to all connected clients with CRUD operation type.
        
        Args:
            data: The data payload to broadcast
            type: Type of operation ("create", "update", "delete")
            sender_websocket: The WebSocket that initiated the broadcast, will be checked for sender roles
            skip_self: If True, the sender will not receive their own update
        
        Automatically includes for each recipient:
        - `username` property extracted from the recipient's websocket.state.user
        - `type` to indicate the CRUD operation
        """
        # Validate sender permission if a sender websocket is provided
        if sender_websocket and not self._validate_sender_roles(sender_websocket):
            logger.warning(f"Data broadcast attempt from user without sender role: {sender_websocket.state.user.get('name')}")
            return
        
        # Send to all connected clients (except sender if skip_self is True)
        for connection in self.active_connections:
            # Skip sender if requested
            if skip_self and connection == sender_websocket:
                continue
                
            await self.send(data, type, connection)
