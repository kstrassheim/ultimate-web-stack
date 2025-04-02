from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# Create a WebSocket router
chat_router = APIRouter()

@chat_router.websocket("/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        pass

