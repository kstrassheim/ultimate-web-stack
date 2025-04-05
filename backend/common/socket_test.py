import pytest
import asyncio
from common.socket import ConnectionManager
from fastapi import WebSocket

# Create a dummy logger class for tests to avoid missing attributes on the logger.
class DummyLogger:
    level = 0
    def warning(self, *args, **kwargs):
        pass
    def error(self, *args, **kwargs):
        pass
    def info(self, *args, **kwargs):
        pass

# Create a fake WebSocket class to simulate behavior
class FakeWebSocket:
    def __init__(self):
        self.sent_texts = []
        self.sent_jsons = []
        self.state = type("State", (), {})()
        self.accepted = False
        self.closed = None

    async def accept(self):
        self.accepted = True

    async def send_text(self, message: str):
        self.sent_texts.append(message)

    async def send_json(self, data: dict):
        self.sent_jsons.append(data)

    async def receive_json(self):
        # The test will set this attribute as needed.
        return self.received_json

    async def close(self, code: int, reason: str):
        self.closed = (code, reason)

@pytest.fixture
def manager():
    return ConnectionManager()

@pytest.fixture
def fake_websocket():
    return FakeWebSocket()

@pytest.mark.asyncio
async def test_send_personal_message(manager, fake_websocket):
    # Accept the websocket and send a personal message.
    await fake_websocket.accept()
    message = "Hello, user!"
    await manager.send_personal_message(message, fake_websocket)
    assert fake_websocket.sent_texts == [message]

@pytest.mark.asyncio
async def test_broadcast(manager):
    # Setup two fake websockets and assign them to the manager.
    ws1 = FakeWebSocket()
    ws2 = FakeWebSocket()
    manager.active_connections = [ws1, ws2]
    message = "Broadcast message"
    await manager.broadcast(message)
    assert ws1.sent_texts == [message]
    assert ws2.sent_texts == [message]

@pytest.mark.asyncio
async def test_broadcast_except(manager):
    # Setup three fake websockets; exclude ws2.
    ws1 = FakeWebSocket()
    ws2 = FakeWebSocket()
    ws3 = FakeWebSocket()
    manager.active_connections = [ws1, ws2, ws3]
    message = "Hello everybody except ws2"
    await manager.broadcast_except(message, ws2)
    assert ws1.sent_texts == [message]
    assert ws3.sent_texts == [message]
    assert ws2.sent_texts == []

@pytest.mark.asyncio
async def test_send_data(manager, fake_websocket):
    # Set a fake authenticated user in websocket.state and send JSON data.
    fake_websocket.state.user = {"name": "Alice"}
    data = {"info": "sample data"}
    await manager.send_data(data, fake_websocket)
    # Ensure the sent JSON contains the extra 'username' property.
    sent = fake_websocket.sent_jsons[0]
    assert sent["username"] == "Alice"
    assert sent["info"] == "sample data"

@pytest.mark.asyncio
async def test_auth_connect_success(manager, monkeypatch, fake_websocket):
    # Simulate a valid authentication message.
    fake_websocket.received_json = {"token": "dummy-token"}
    
    # Patch verify_token in the socket module to return valid claims.
    def fake_verify_token(token, required_roles, check_all):
        return {"sub": "user1", "name": "Bob", "roles": ["User"]}
    monkeypatch.setattr("common.socket.verify_token", fake_verify_token)

    await manager.auth_connect(fake_websocket)
    # Check websocket.state.user is set based on claims.
    assert fake_websocket.state.user["sub"] == "user1"
    assert fake_websocket.state.user["name"] == "Bob"
    # Ensure the websocket was accepted and added.
    assert fake_websocket.accepted
    assert fake_websocket in manager.active_connections

@pytest.mark.asyncio
async def test_auth_connect_fail_missing_token(manager, monkeypatch, fake_websocket):
    # Replace logger in common.socket with DummyLogger to avoid attribute errors.
    monkeypatch.setattr("common.socket.logger", DummyLogger())

    # Simulate a receive_json with missing token.
    fake_websocket.received_json = {}
    await manager.auth_connect(fake_websocket)
    # Expect the websocket to be closed with code 1008 ("Missing authentication token").
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert "Missing authentication token" in reason
    # The websocket should not be in the active connections.
    assert fake_websocket not in manager.active_connections

@pytest.mark.asyncio
async def test_auth_connect_fail_invalid_claims(manager, monkeypatch, fake_websocket):
    # Replace logger in common.socket with DummyLogger to avoid missing attribute errors.
    monkeypatch.setattr("common.socket.logger", DummyLogger())
    
    # Simulate a token provided but missing required 'sub' claim.
    fake_websocket.received_json = {"token": "dummy-token"}
    
    def fake_verify_token(token, required_roles, check_all):
        return {"name": "NoSub", "roles": ["User"]}
    monkeypatch.setattr("common.socket.verify_token", fake_verify_token)
    
    await manager.auth_connect(fake_websocket)
    # Expect closure due to missing 'sub' claim.
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert "Invalid token claims" in reason
    assert fake_websocket not in manager.active_connections