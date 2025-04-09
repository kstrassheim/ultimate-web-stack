import pytest
import asyncio
import datetime
from common.socket import ConnectionManager
from fastapi import WebSocket
import sys
import gc

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
    
    # Check that timestamps exist and are valid
    assert "timestamp" in ws1.sent_jsons[0]
    assert "timestamp" in ws2.sent_jsons[0]
    # Verify timestamps are in valid ISO format
    for websocket in [ws1, ws2]:
        try:
            datetime.datetime.fromisoformat(websocket.sent_jsons[0]["timestamp"])
        except ValueError:
            pytest.fail(f"Timestamp is not in valid ISO format: {websocket.sent_jsons[0]['timestamp']}")

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
    
    # Verify timestamp field exists and is in ISO format
    assert "timestamp" in sent
    # Try parsing the timestamp to verify it's in ISO format
    try:
        datetime.datetime.fromisoformat(sent["timestamp"])
    except ValueError:
        pytest.fail(f"Timestamp is not in valid ISO format: {sent['timestamp']}")

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
    
    # Verify all messages have the username, timestamp and data fields
    for message in fake_websocket.sent_jsons:
        assert message["username"] == "Bob"
        assert message["record_id"] == "123"
        assert message["content"] == "test content"
        assert "timestamp" in message
        # Verify timestamp is in valid ISO format
        try:
            datetime.datetime.fromisoformat(message["timestamp"])
        except ValueError:
            pytest.fail(f"Timestamp is not in valid ISO format: {message['timestamp']}")

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
    
    # Verify the message content for each recipient including timestamp
    for websocket in [ws1, ws2]:
        sent_json = websocket.sent_jsons[0]
        assert sent_json["record_id"] == "123"
        assert sent_json["content"] == "broadcast test"
        assert sent_json["type"] == "update"
        assert "timestamp" in sent_json
        # Verify timestamp is in valid ISO format
        try:
            datetime.datetime.fromisoformat(sent_json["timestamp"])
        except ValueError:
            pytest.fail(f"Timestamp is not in valid ISO format: {sent_json['timestamp']}")

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

@pytest.mark.asyncio
async def test_auth_data_clear(manager, fake_websocket):
    """Test that sensitive auth data is properly cleared from memory."""
    # Create auth data with a fake token
    token_value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    auth_data = {"token": token_value, "other_field": "test"}
    
    # Attach the auth data to the fake websocket for the receive_json method
    fake_websocket.received_json = auth_data
    
    # Keep reference to original dict to check it later
    original_auth_data = auth_data
    
    # Mock necessary methods for a successful connection
    # Create a mock verify_token function - NOT async
    def mock_verify_token(token, roles, check_all):
        return {"sub": "test-subject", "name": "Test User", "roles": []}
    
    # Mock verify_token function temporarily
    import common.socket
    original_verify_token = common.socket.verify_token
    common.socket.verify_token = mock_verify_token
    
    try:
        # Call auth_connect which should clear the auth_data
        await manager.auth_connect(fake_websocket)
        
        # Check if the original dictionary is now empty (cleared)
        assert len(original_auth_data) == 0, "auth_data was not cleared properly"
        
        # Validate that token is no longer in the dictionary
        assert "token" not in original_auth_data, "Token was not removed from auth_data"
        
        # Force a garbage collection to make the test more reliable
        gc.collect()
        
        # Verify the websocket was accepted and added to connections
        assert fake_websocket.accepted is True
        assert fake_websocket in manager.active_connections
        
        # Verify user details were set from claims
        assert fake_websocket.state.user["name"] == "Test User"
        
    finally:
        # Restore original verify_token
        common.socket.verify_token = original_verify_token

@pytest.mark.asyncio
async def test_send_server(manager, fake_websocket):
    """Test sending a server message to a specific client."""
    # Setup a fake websocket
    await fake_websocket.accept()
    
    # Create test data
    data = {"action": "worldline_update", "value": 1.048596}
    
    # Send server message
    await manager.send_server(data, "update", fake_websocket)
    
    # Verify the message was sent
    assert len(fake_websocket.sent_jsons) == 1
    sent = fake_websocket.sent_jsons[0]
    
    # Check message contents
    assert sent["action"] == "worldline_update"
    assert sent["value"] == 1.048596
    assert sent["username"] == "SERVER"
    assert sent["type"] == "update"
    assert sent["server_initiated"] is True
    
    # Check timestamp is in valid ISO format
    try:
        datetime.datetime.fromisoformat(sent["timestamp"])
    except ValueError:
        pytest.fail(f"Timestamp is not in valid ISO format: {sent['timestamp']}")

@pytest.mark.asyncio
async def test_send_server_with_custom_username(manager, fake_websocket):
    """Test sending a server message with custom username."""
    # Setup a fake websocket
    await fake_websocket.accept()
    
    # Create test data
    data = {"action": "experiment_updated", "id": "EXP-001"}
    
    # Send server message with custom username
    await manager.send_server(data, "update", fake_websocket, username="Experiment Monitor")
    
    # Verify the message was sent with custom username
    assert len(fake_websocket.sent_jsons) == 1
    sent = fake_websocket.sent_jsons[0]
    
    # Check username was set to custom value
    assert sent["username"] == "Experiment Monitor"
    assert sent["server_initiated"] is True

@pytest.mark.asyncio
async def test_broadcast_server(manager, monkeypatch):
    """Test broadcasting server message to all connected clients."""
    # Mock the logger to avoid real logging
    monkeypatch.setattr("common.socket.logger", DummyLogger())
    
    # Setup multiple fake websockets
    ws1 = FakeWebSocket()
    await ws1.accept()
    ws1.state.user = {"name": "User1"}
    
    ws2 = FakeWebSocket()
    await ws2.accept()
    ws2.state.user = {"name": "User2"}
    
    # Add websockets to active connections
    manager.active_connections = [ws1, ws2]
    
    # Create test data
    data = {
        "action": "experiment_created", 
        "experiment_id": "EXP-001", 
        "experiment_name": "Phone Microwave",
        "worldline_change": 0.337192
    }
    
    # Broadcast server message
    await manager.broadcast_server(data, "notification")
    
    # Verify all clients received the message
    for websocket in [ws1, ws2]:
        assert len(websocket.sent_jsons) == 1
        sent = websocket.sent_jsons[0]
        
        # Check message contents
        assert sent["action"] == "experiment_created"
        assert sent["experiment_id"] == "EXP-001"
        assert sent["experiment_name"] == "Phone Microwave"
        assert sent["worldline_change"] == 0.337192
        assert sent["username"] == "SERVER"
        assert sent["type"] == "notification"
        assert sent["server_initiated"] is True
        
        # Check timestamp is in valid ISO format
        try:
            datetime.datetime.fromisoformat(sent["timestamp"])
        except ValueError:
            pytest.fail(f"Timestamp is not in valid ISO format: {sent['timestamp']}")

@pytest.mark.asyncio
async def test_broadcast_server_with_custom_username(manager, monkeypatch):
    """Test broadcasting server message with custom username."""
    # Mock the logger to avoid real logging
    monkeypatch.setattr("common.socket.logger", DummyLogger())
    
    # Setup multiple fake websockets
    ws1 = FakeWebSocket()
    await ws1.accept()
    ws2 = FakeWebSocket()
    await ws2.accept()
    
    # Add websockets to active connections
    manager.active_connections = [ws1, ws2]
    
    # Create test data
    data = {
        "action": "worldline_diverged", 
        "new_value": 1.048596,
        "status": "steins_gate"
    }
    
    # Broadcast server message with custom username
    await manager.broadcast_server(data, "alert", username="Divergence Meter")
    
    # Verify all clients received the message with custom username
    for websocket in [ws1, ws2]:
        assert len(websocket.sent_jsons) == 1
        sent = websocket.sent_jsons[0]
        assert sent["username"] == "Divergence Meter"
        assert sent["server_initiated"] is True

@pytest.mark.asyncio
async def test_broadcast_server_with_errors(manager, monkeypatch):
    """Test broadcast_server handles errors with individual clients gracefully."""
    # Create a logger that will collect error messages
    error_messages = []
    
    class TestLogger(DummyLogger):
        def error(self, message):
            error_messages.append(message)
    
    # Mock the logger
    mock_logger = TestLogger()
    monkeypatch.setattr("common.socket.logger", mock_logger)
    
    # Create a normal websocket
    normal_ws = FakeWebSocket()
    await normal_ws.accept()
    
    # Create a problematic websocket that will raise an exception
    class ProblemWebSocket(FakeWebSocket):
        async def send_json(self, data: dict):
            raise Exception("Connection error")
    
    problem_ws = ProblemWebSocket()
    await problem_ws.accept()
    
    # Add both websockets to active connections
    manager.active_connections = [normal_ws, problem_ws]
    
    # Create test data
    data = {"action": "system_notification", "message": "Testing error handling"}
    
    # Broadcast server message
    await manager.broadcast_server(data, "alert")
    
    # Verify the normal websocket received the message
    assert len(normal_ws.sent_jsons) == 1
    assert normal_ws.sent_jsons[0]["action"] == "system_notification"
    
    # Verify an error was logged for the problematic websocket
    assert len(error_messages) == 1
    assert "Error broadcasting to client" in error_messages[0]
    
    # Ensure the broadcast continued despite the error
    assert len(normal_ws.sent_jsons) == 1