from fastapi import WebSocket, WebSocketDisconnect

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

    async def broadcast_except(self, message: str, exclude_websocket: WebSocket):
        #Send message to all connections except the specified one
        for connection in self.active_connections:
            if connection != exclude_websocket:
                await connection.send_text(message)

# Create a manager instance
manager = ConnectionManager()