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
async def test_broadcast_text(manager):
    # Setup two fake websockets and assign them to the manager.
    ws1 = FakeWebSocket()
    ws2 = FakeWebSocket()
    manager.active_connections = [ws1, ws2]
    
    # Create a data object instead of a string
    data = {"message": "Broadcast message"}
    
    # Call broadcast with required type parameter
    await manager.broadcast(data, "message")
    
    # Check that the message was received as JSON
    assert len(ws1.sent_jsons) == 1
    assert len(ws2.sent_jsons) == 1
    assert ws1.sent_jsons[0]["message"] == "Broadcast message"
    assert ws2.sent_jsons[0]["message"] == "Broadcast message"
    assert ws1.sent_jsons[0]["type"] == "message"
    assert ws2.sent_jsons[0]["type"] == "message"

@pytest.mark.asyncio
async def test_send_method(manager, fake_websocket):
    # Set a fake authenticated user in websocket.state and send JSON data.
    fake_websocket.state.user = {"name": "Alice"}
    data = {"info": "sample data"}
    
    # Test with valid type parameter
    await manager.send(data, "create", fake_websocket)
    
    # Ensure the sent JSON contains the extra 'username' property and correct type
    sent = fake_websocket.sent_jsons[0]
    assert sent["username"] == "Alice"
    assert sent["info"] == "sample data"
    assert sent["type"] == "create"

@pytest.mark.asyncio
async def test_send_with_all_types(manager, fake_websocket):
    # Test with all valid type parameters
    fake_websocket.state.user = {"name": "Bob"}
    data = {"record_id": "123", "content": "test content"}
    
    # Test create operation
    await manager.send(data, "create", fake_websocket)
    assert fake_websocket.sent_jsons[0]["type"] == "create"
    
    # Test update operation
    await manager.send(data, "update", fake_websocket)
    assert fake_websocket.sent_jsons[1]["type"] == "update"
    
    # Test delete operation
    await manager.send(data, "delete", fake_websocket)
    assert fake_websocket.sent_jsons[2]["type"] == "delete"
    
    # Test message operation
    await manager.send(data, "message", fake_websocket)
    assert fake_websocket.sent_jsons[3]["type"] == "message"
    
    # Verify all messages have the username
    for message in fake_websocket.sent_jsons:
        assert message["username"] == "Bob"
        assert message["record_id"] == "123"
        assert message["content"] == "test content"

@pytest.mark.asyncio
async def test_send_with_invalid_type(manager, fake_websocket):
    # Test with invalid type parameter - should raise ValueError
    fake_websocket.state.user = {"name": "Charlie"}
    data = {"info": "test with invalid type"}
    
    # Use an invalid type and expect a ValueError
    with pytest.raises(ValueError) as excinfo:
        await manager.send(data, "invalid_type", fake_websocket)
    
    # Verify exception message contains valid types
    assert "Invalid type parameter" in str(excinfo.value)
    assert "message" in str(excinfo.value)
    assert "create" in str(excinfo.value)
    assert "update" in str(excinfo.value)
    assert "delete" in str(excinfo.value)
    
    # Verify no messages were sent
    assert len(fake_websocket.sent_jsons) == 0

@pytest.mark.asyncio
async def test_broadcast_data(manager):
    # Setup multiple fake websockets
    ws1 = FakeWebSocket()
    ws1.state.user = {"name": "User1"}
    
    ws2 = FakeWebSocket()
    ws2.state.user = {"name": "User2"}
    
    sender = FakeWebSocket()
    sender.state.user = {"name": "Sender"}
    
    # Add all to active connections
    manager.active_connections = [ws1, ws2, sender]
    
    # Test broadcasting data
    data = {"record_id": "123", "content": "broadcast test"}
    await manager.broadcast(data, "update", sender, skip_self=True)
    
    # Verify only ws1 and ws2 received the data (sender was skipped)
    assert len(ws1.sent_jsons) == 1
    assert len(ws2.sent_jsons) == 1
    assert len(sender.sent_jsons) == 0
    
    # Verify the message content for each recipient
    assert ws1.sent_jsons[0]["record_id"] == "123"
    assert ws1.sent_jsons[0]["content"] == "broadcast test"
    assert ws1.sent_jsons[0]["type"] == "update"
    assert ws1.sent_jsons[0]["username"] == "User1"  # Each recipient gets their own username
    
    assert ws2.sent_jsons[0]["record_id"] == "123"
    assert ws2.sent_jsons[0]["content"] == "broadcast test"
    assert ws2.sent_jsons[0]["type"] == "update"
    assert ws2.sent_jsons[0]["username"] == "User2"  # Each recipient gets their own username

@pytest.mark.asyncio
async def test_broadcast_with_skip_self_false(manager):
    # Setup websockets including a sender
    ws1 = FakeWebSocket()
    ws1.state.user = {"name": "User1"}
    
    sender = FakeWebSocket()
    sender.state.user = {"name": "Sender"}
    
    # Add all to active connections
    manager.active_connections = [ws1, sender]
    
    # Test broadcasting data with skip_self=False
    data = {"record_id": "456", "content": "include sender test"}
    await manager.broadcast(data, "create", sender, skip_self=False)
    
    # Verify both ws1 and sender received the data
    assert len(ws1.sent_jsons) == 1
    assert len(sender.sent_jsons) == 1
    
    # Verify the message content for each recipient
    assert ws1.sent_jsons[0]["record_id"] == "456"
    assert ws1.sent_jsons[0]["type"] == "create"
    
    assert sender.sent_jsons[0]["record_id"] == "456"
    assert sender.sent_jsons[0]["type"] == "create"
    assert sender.sent_jsons[0]["username"] == "Sender"

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