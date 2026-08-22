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
        # Mirror Starlette's WebSocket.client (host, port) tuple so the
        # timeout-warning log path that uses websocket.client doesn't
        # AttributeError when run against this fake.
        self.client = ("203.0.113.7", 54321)

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

    # Simulate a receive_json with missing token. Start from a pre-existing
    # tracking entry to verify every failed handshake path cleans it up.
    manager.active_connections.append(fake_websocket)
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


@pytest.mark.asyncio
async def test_auth_connect_timeout(manager, monkeypatch, fake_websocket):
    """A client that connects but never sends an auth message must be
    disconnected after the handshake deadline (issue #111)."""
    import common.socket

    # Shorten the module-level timeout so the test stays fast.
    monkeypatch.setattr(common.socket, "AUTH_HANDSHAKE_TIMEOUT_SECONDS", 0.05)

    # Capture the warning so we can prove the timeout was logged.
    warnings: list[str] = []

    class _CapturingLogger(DummyLogger):
        def warning(self, message):
            warnings.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    # Override receive_json to block until the deadline fires.
    async def _block_forever():
        await asyncio.Event().wait()  # never set
        return {}  # unreachable

    fake_websocket.receive_json = _block_forever

    await manager.auth_connect(fake_websocket)

    # The socket was accepted (FastAPI/WebSocket lifecycle) but must have
    # been closed with a policy-violation code, and must not be tracked
    # as an active connection.
    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert "timeout" in reason.lower()
    assert fake_websocket not in manager.active_connections

    # The timeout must be logged so operators can spot abuse, and the
    # log line must include the peer host:port so the warning is
    # actionable (issue #111 acceptance criterion).
    assert any("timed out" in w for w in warnings), warnings
    assert any("203.0.113.7:54321" in w for w in warnings), warnings


@pytest.mark.asyncio
async def test_auth_connect_rejects_non_dict_payload(manager, monkeypatch, fake_websocket):
    """`receive_json()` returns whatever JSON the client sent — a list, a
    number, a string, null, a boolean — so the first frame may not be a
    dict at all. The auth flow must reject those shapes the same way it
    rejects a missing `token` field, instead of crashing on the
    `auth_data.get('token')` AttributeError that would otherwise escape
    `auth_connect` and leave the socket in an undefined state."""
    import common.socket

    warnings: list[str] = []

    class _CapturingLogger(DummyLogger):
        def warning(self, message):
            warnings.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    # Try every JSON shape that is not a dict. Each one must close the
    # socket with 1008 and never enter active_connections.
    for payload in [[1, 2, 3], "not-a-dict", 42, None, True, {"token": None}]:
        fake_websocket.received_json = payload
        manager.active_connections.clear()
        fake_websocket.closed = None
        await manager.auth_connect(fake_websocket)

        assert fake_websocket.closed is not None, f"payload {payload!r} was not closed"
        code, reason = fake_websocket.closed
        assert code == 1008, f"payload {payload!r} got close code {code}"
        assert "token" in reason.lower(), f"payload {payload!r} got reason {reason!r}"
        assert fake_websocket not in manager.active_connections, (
            f"payload {payload!r} leaked into active_connections"
        )

    # The non-dict payloads must be logged with the type name so an
    # operator can tell a malformed-frame flood apart from a missing-
    # token flood.
    assert any("non-dict" in w for w in warnings), warnings
    assert any("list" in w for w in warnings), warnings
    assert any("str" in w for w in warnings), warnings


@pytest.mark.asyncio
async def test_auth_connect_rejects_invalid_json(manager, monkeypatch, fake_websocket):
    """A client that opens the socket and sends a non-JSON blob (or an
    ill-formed JSON value like a bare ``{``) used to make
    ``receive_json()`` raise ``JSONDecodeError``, which escaped
    ``auth_connect`` and surfaced to the outer endpoint handler — closing
    the socket with code 1006 (abnormal closure) rather than 1008 (policy
    violation). The auth flow must instead close with 1008 + a frame
    rejection reason and stay out of ``active_connections``, so the
    closing code matches what the client did wrong (bad frame, not a
    transport failure)."""
    import common.socket
    import json as _json

    warnings: list[str] = []

    class _CapturingLogger(DummyLogger):
        def warning(self, message):
            warnings.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    # `receive_json()` should raise JSONDecodeError when the frame is not
    # valid JSON. Wire that directly into the fake so we don't depend on
    # starlette's JSON parser behaviour.
    async def _raise_json_decode_error():
        raise _json.JSONDecodeError("Expecting value", "", 0)

    fake_websocket.receive_json = _raise_json_decode_error

    await manager.auth_connect(fake_websocket)

    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008, f"got close code {code}"
    assert "invalid" in reason.lower(), f"got reason {reason!r}"
    assert fake_websocket not in manager.active_connections

    # Must be logged distinctly from missing-token / non-dict so a
    # malformed-frame flood is observable in isolation.
    assert any("invalid json" in w.lower() for w in warnings), warnings


@pytest.mark.asyncio
async def test_auth_connect_closes_on_verify_token_no_claims(
    manager, monkeypatch, fake_websocket
):
    """`verify_token` returning a falsy value (the mock path's empty
    payload branch, or a future implementation that returns ``None``)
    must close with 1008 ``Invalid authentication token`` and stay out
    of ``active_connections``, matching the other failure paths. The
    pre-fix code only checked ``not auth_data.get('token')`` on the
    payload — a ``None`` from verify_token would have leaked the
    socket past the ``if not claims`` guard on the original
    implementation, and could regress if the guard is moved again."""
    import common.socket
    from fastapi import HTTPException

    warnings: list[str] = []

    class _CapturingLogger(DummyLogger):
        def warning(self, message):
            warnings.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    def _verify_returns_none(token, required_roles, check_all):
        return None

    monkeypatch.setattr(common.socket, "verify_token", _verify_returns_none)

    fake_websocket.received_json = {"token": "any-token"}
    await manager.auth_connect(fake_websocket)

    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert reason == "Invalid authentication token"
    assert fake_websocket not in manager.active_connections
    # Distinct log so a token-passing-but-falsy-claims flood stays
    # observable alongside the missing-token and invalid-frame floods.
    assert any("invalid token (no claims)" in w for w in warnings), warnings


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "http_status,expected_close_reason,expected_log_substr",
    [
        (403, "Insufficient permissions to receive data", "Receiver role check"),
        # Any non-403 HTTPException (e.g. 401 from a JWKS failure)
        # takes the "HTTP error" branch with the exception detail as
        # the close reason. The operator needs to see the original
        # detail in the log, not just the close code.
        (401, "kid lookup failed", "HTTP error"),
    ],
)
async def test_auth_connect_closes_on_verify_token_http_exception(
    manager,
    monkeypatch,
    fake_websocket,
    http_status,
    expected_close_reason,
    expected_log_substr,
):
    """HTTPException raised from verify_token must close the socket
    with 1008 and stay out of active_connections. The 403 path uses a
    fixed close reason (``Insufficient permissions``); every other
    status forwards the exception detail verbatim so a 401 from the
    JWKS lookup is distinguishable in the client logs from a generic
    auth failure."""
    import common.socket
    from fastapi import HTTPException

    log_calls: list[tuple[str, str]] = []

    class _CapturingLogger(DummyLogger):
        def warning(self, message):
            log_calls.append(("warning", message))

        def error(self, message):
            log_calls.append(("error", message))

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    def _raise_http(token, required_roles, check_all):
        raise HTTPException(status_code=http_status, detail=expected_close_reason)

    monkeypatch.setattr(common.socket, "verify_token", _raise_http)

    fake_websocket.received_json = {"token": "any-token"}
    await manager.auth_connect(fake_websocket)

    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert reason == expected_close_reason
    assert fake_websocket not in manager.active_connections
    # Logged as warning for 403 (an expected, action-able failure),
    # error for everything else (a backend/server problem the operator
    # needs to investigate).
    expected_level = "warning" if http_status == 403 else "error"
    assert any(
        level == expected_level and expected_log_substr in message
        for level, message in log_calls
    ), log_calls


@pytest.mark.asyncio
async def test_auth_connect_closes_on_invalid_token_error(
    manager, monkeypatch, fake_websocket
):
    """PyJWT's ``InvalidTokenError`` (signature mismatch, expired
    exp, bad audience, malformed payload) must close with 1008
    ``Invalid authentication token`` and stay out of
    ``active_connections``. Logged at ``error`` level since this
    indicates a real (non-policy) JWT verification failure that the
    operator should see in incident triage."""
    import common.socket
    from jwt import InvalidTokenError

    error_messages: list[str] = []

    class _CapturingLogger(DummyLogger):
        def error(self, message):
            error_messages.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    def _raise_invalid_token(token, required_roles, check_all):
        raise InvalidTokenError("Signature verification failed")

    monkeypatch.setattr(common.socket, "verify_token", _raise_invalid_token)

    fake_websocket.received_json = {"token": "any-token"}
    await manager.auth_connect(fake_websocket)

    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert reason == "Invalid authentication token"
    assert fake_websocket not in manager.active_connections
    assert any("JWT Error" in m for m in error_messages), error_messages


@pytest.mark.asyncio
async def test_auth_connect_closes_on_verify_token_unexpected_exception(
    manager, monkeypatch, fake_websocket
):
    """An unexpected non-HTTPException, non-InvalidTokenError from
    verify_token must close with 1011 (``internal error``) rather
    than 1008 so the close code signals a server-side problem rather
    than a policy rejection. Logged at error level with the exception
    text so the operator can find the underlying failure in their log
    pipeline."""
    import common.socket

    error_messages: list[str] = []

    class _CapturingLogger(DummyLogger):
        def error(self, message):
            error_messages.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    def _raise_unexpected(token, required_roles, check_all):
        raise RuntimeError("JWKS fetch timed out")

    monkeypatch.setattr(common.socket, "verify_token", _raise_unexpected)

    fake_websocket.received_json = {"token": "any-token"}
    await manager.auth_connect(fake_websocket)

    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1011
    assert reason == "Authentication server error"
    assert fake_websocket not in manager.active_connections
    assert any("JWKS fetch timed out" in m for m in error_messages), error_messages


@pytest.mark.asyncio
async def test_auth_connect_closes_on_claims_missing_sub(
    manager, monkeypatch, fake_websocket
):
    """A token that validates successfully but produces claims
    without a ``sub`` field must close with 1008 ``Invalid token
    claims`` and stay out of ``active_connections``. The
    `websocket.state.user` dict is the source of truth for downstream
    code (``send_personal_message``, ``broadcast``), and an
    unset ``sub`` would propagate as a missing-key error the first
    time a chat message is attributed."""
    import common.socket

    warnings: list[str] = []

    class _CapturingLogger(DummyLogger):
        def warning(self, message):
            warnings.append(message)

    monkeypatch.setattr(common.socket, "logger", _CapturingLogger())

    def _verify_no_sub(token, required_roles, check_all):
        # No ``sub`` — everything else is fine.
        return {"name": "Anonymous", "roles": ["User"]}

    monkeypatch.setattr(common.socket, "verify_token", _verify_no_sub)

    fake_websocket.received_json = {"token": "any-token"}
    await manager.auth_connect(fake_websocket)

    assert fake_websocket.accepted is True
    assert fake_websocket.closed is not None
    code, reason = fake_websocket.closed
    assert code == 1008
    assert reason == "Invalid token claims"
    assert fake_websocket not in manager.active_connections
    # ``state.user`` must NOT be populated when the handshake is
    # rejected after the token was accepted.
    assert not hasattr(fake_websocket.state, "user")
    assert any("missing required 'sub' claim" in w for w in warnings), warnings
