import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import patch, MagicMock, AsyncMock
from types import SimpleNamespace
from fastapi import WebSocketDisconnect
import datetime

from api.future_gadget_api import future_gadget_api_router
from common.auth import azure_scheme
from common.role_based_access import required_roles
from common.log import logger

# Create a test app using the actual router
app = FastAPI()
app.include_router(future_gadget_api_router)
client = TestClient(app)
API_PREFIX = ""

# Fixture to override security and logging similar to api_test.py
@pytest.fixture
def mock_dependencies():
    mock_token = SimpleNamespace(roles=["Admin"])
    with patch("api.future_gadget_api.azure_scheme") as mock_scheme, \
         patch("api.future_gadget_api.required_roles", return_value=lambda f: f), \
         patch("api.future_gadget_api.logger") as mock_logger:
        mock_scheme.return_value = mock_token
        yield {
            "token": mock_token,
            "scheme": mock_scheme,
            "logger": mock_logger
        }

# Fixture to override dependencies in the app for integration testing
@pytest.fixture
def client_with_overridden_dependencies():
    test_app = FastAPI()
    mock_token = SimpleNamespace(roles=["Admin"])

    async def override_security_dependency():
        return mock_token

    with patch("api.future_gadget_api.logger") as mock_logger:
        test_app.dependency_overrides[azure_scheme] = override_security_dependency
        test_app.include_router(future_gadget_api_router)
        test_client = TestClient(test_app)
        yield test_client, mock_logger

# New fixture to patch the fgl_service with dummy CRUD behavior
@pytest.fixture
def mock_dependencies() (rest omitted)

@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket object with all necessary attributes"""
    mock_ws = MagicMock()
    
    # Set up the state with user info
    mock_ws.state = MagicMock()
    mock_ws.state.user = MagicMock()
    mock_ws.state.user.name = "Test User"
    mock_ws.state.user.sub = "test-id"
    mock_ws.state.user.roles = ["Admin"]
    
    # Set up receive_text that can be overridden in tests
    mock_ws.receive_text = AsyncMock(return_value="Hello, WebSocket!")
    
    # Set up send_text method
    async def mock_send_text(message):
        mock_ws.sent_messages = getattr(mock_ws, 'sent_messages', [])
        mock_ws.sent_messages.append(message)
    
    mock_ws.send_text = mock_send_text
    
    # Set up send_json method
    async def mock_send_json(data):
        mock_ws.sent_json = getattr(mock_ws, 'sent_json', [])
        mock_ws.sent_json.append(data)
    
    mock_ws.send_json = mock_send_json
    
    return mock_ws

# Tests below this comment (omitted for brevity; the relevant diff is in
# TestWorldlineEndpoints::test_worldline_websocket_endpoint)