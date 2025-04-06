import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from fastapi import FastAPI, Depends
from unittest.mock import patch, MagicMock, AsyncMock
from api.api import api_router, get_user_data, get_admin_data
from common.auth import azure_scheme
from common.role_based_access import required_roles
from common.log import logger
from types import SimpleNamespace
import json
from fastapi import WebSocketDisconnect

# Create a test app
app = FastAPI()
app.include_router(api_router)
client = TestClient(app)

# Fix 1: Patch the security dependency directly at function level
@pytest.fixture
def mock_dependencies():
    # Create a valid admin token as an object with roles attribute, not a dictionary
    mock_token = SimpleNamespace(roles=["Admin"])
    
    # Use multiple patches to mock all dependencies
    with patch("api.api.azure_scheme") as mock_scheme, \
         patch("api.api.required_roles", return_value=lambda f: f) as mock_roles, \
         patch("api.api.logger") as mock_logger:
         
        # Configure the security scheme to return a token when called
        mock_scheme.return_value = mock_token
        
        yield {
            "token": mock_token,
            "scheme": mock_scheme,
            "roles": mock_roles,
            "logger": mock_logger
        }

# Fix 2: Bypass FastAPI's dependency injection and test functions directly
class TestAPIDirectFunctions:
    """Test the API functions directly, bypassing FastAPI's dependency injection"""
    
    @pytest.mark.asyncio  # Mark as asyncio test
    async def test_get_user_data_direct(self, mock_dependencies):
        """Test user data function directly"""
        result = await get_user_data(token=mock_dependencies["token"])
        assert result == {"message": "Hello from API"}
        mock_dependencies["logger"].info.assert_called_with("User Api - Returning User data")
    
    @pytest.mark.asyncio  # Mark as asyncio test
    async def test_get_admin_data_direct(self, mock_dependencies):
        """Test admin data function directly"""
        from api.api import AdminDataRequest
        
        # Create a request body
        request = AdminDataRequest(message="Test Message", status=200)
        
        # Call the function directly
        result = await get_admin_data(request, token=mock_dependencies["token"])
        
        assert result == {
            "message": "Hello Admin: Test Message",
            "status": 200,
            "received": True
        }
        
        mock_dependencies["logger"].info.assert_called_with(
            "Admin API - Message: Test Message, Status: 200"
        )

# Fix 3: Create a new app with overridden dependencies for integration testing
@pytest.fixture
def client_with_overridden_dependencies():
    # Create a new app for testing
    test_app = FastAPI()
    
    # Create mock token with admin role as an object, not a dict
    mock_token = SimpleNamespace(roles=["Admin"])
    
    # Override the security dependency
    async def override_security_dependency():
        return mock_token
    
    # Apply the router with overridden dependencies
    with patch("api.api.logger") as mock_logger:
        # Override the security dependency in the router
        app = FastAPI()
        
        # Override dependencies
        app.dependency_overrides[azure_scheme] = override_security_dependency
        app.include_router(api_router)
        
        # Create test client
        test_client = TestClient(app)
        
        yield test_client, mock_logger

class TestAPIEndpoints:
    """Test the API through HTTP endpoints with mocked dependencies"""
    
    def test_endpoints_with_overridden_dependencies(self, client_with_overridden_dependencies):
        """Test endpoints using a client with overridden dependencies"""
        test_client, mock_logger = client_with_overridden_dependencies
        
        # Test GET user-data
        response = test_client.get("/user-data")
        assert response.status_code == 200
        assert response.json() == {"message": "Hello from API"}
        
        # Test POST admin-data
        response = test_client.post(
            "/admin-data", 
            json={"message": "Log test", "status": 200}
        )
        assert response.status_code == 200
        assert response.json() == {
            "message": "Hello Admin: Log test",
            "status": 200,
            "received": True
        }
        
        # Verify logging
        mock_logger.info.assert_any_call("User Api - Returning User data")
        mock_logger.info.assert_any_call("Admin API - Message: Log test, Status: 200")
    
    def test_admin_data_error_response(self, client_with_overridden_dependencies):
        """Test admin-data endpoint with error status code"""
        test_client, mock_logger = client_with_overridden_dependencies
        
        # Test with status code 400 (error case)
        error_message = "Test error message"
        response = test_client.post(
            "/admin-data", 
            json={"message": error_message, "status": 400}
        )
        assert response.status_code == 400
        assert response.json() == {"detail": error_message}
        
        # Verify logging
        mock_logger.info.assert_any_call(f"Admin API - Message: {error_message}, Status: 400")

# Add this new class for WebSocket testing
class TestWebSocketEndpoint:
    """Test the WebSocket chat endpoint"""
    
    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket object"""
        mock_ws = MagicMock()
        # Set up the state with user info
        mock_ws.state = MagicMock()
        mock_ws.state.user = {"name": "Test User", "sub": "test-id", "roles": ["User"]}
        
        # Set up receive_text to return predefined messages with AsyncMock
        mock_ws.receive_text = AsyncMock(return_value="Hello, WebSocket!")
        
        # Initialize tracking attributes
        mock_ws.personal_messages = []
        
        return mock_ws
    
    @pytest.mark.asyncio
    async def test_websocket_endpoint_connection(self, monkeypatch):
        """Test WebSocket connection and authentication"""
        # Create a mock connection manager with AsyncMock
        mock_manager = MagicMock()
        mock_manager.auth_connect = AsyncMock()
        mock_manager.auth_connect.return_value = None  # auth_connect doesn't return anything
        
        # Patch the ChatConnectionManager in api.py
        monkeypatch.setattr("api.api.chatConnectionManager", mock_manager)
        
        # Create a mock WebSocket
        mock_ws = MagicMock()
        mock_ws.receive_text = AsyncMock(side_effect=WebSocketDisconnect())
        
        # Call the WebSocket endpoint function
        try:
            await api_router.routes[-1].endpoint(mock_ws)
        except Exception:
            pass  # Expect an exception since we're not fully simulating the WebSocket lifecycle
        
        # Verify the connection was authenticated with assert_called_once
        assert mock_manager.auth_connect.call_count == 1
    
    @pytest.mark.asyncio
    async def test_websocket_message_handling(self, monkeypatch, mock_websocket):
        """Test WebSocket message handling"""
        # Create a mock connection manager with AsyncMock methods
        mock_manager = MagicMock()
        mock_manager.auth_connect = AsyncMock()
        mock_manager.send_personal_message = AsyncMock()

        # Create a list to track broadcast calls manually
        broadcast_calls = []
        
        # Create a custom async mock for broadcast that tracks all arguments
        async def mock_broadcast(data, type, **kwargs):
            broadcast_calls.append((data, type, kwargs))
            return None
        
        mock_manager.broadcast = mock_broadcast
        mock_manager.active_connections = []

        # Patch the ChatConnectionManager in api.py
        monkeypatch.setattr("api.api.chatConnectionManager", mock_manager)

        # Set up the mock to return one message then raise WebSocketDisconnect
        mock_websocket.receive_text = AsyncMock(side_effect=[
            "Hello, WebSocket!",
            WebSocketDisconnect()
        ])

        # Make sure state.user is properly configured
        mock_websocket.state.user = {"name": "Test User"}

        # Call the WebSocket endpoint
        try:
            await api_router.routes[-1].endpoint(mock_websocket)
        except Exception as e:
            print(f"Expected exception: {e}")

        # Verify personal message was sent
        assert mock_manager.send_personal_message.called
        assert "You sent: Hello, WebSocket!" in mock_manager.send_personal_message.call_args[0][0]

        # Verify broadcast was called twice (once for the message, once for disconnect)
        assert len(broadcast_calls) == 2

        # Get the call arguments for both calls
        first_call = broadcast_calls[0]  # First call
        first_call_data = first_call[0]  # Data argument
        first_call_type = first_call[1]  # Type argument
        first_call_kwargs = first_call[2]  # Keyword arguments

        second_call = broadcast_calls[1]  # Second call
        second_call_data = second_call[0]  # Data argument
        second_call_type = second_call[1]  # Type argument
        second_call_kwargs = second_call[2]  # Keyword arguments

        # Verify first call (message broadcast)
        assert "content" in first_call_data
        assert first_call_data["content"] == "Test User: Hello, WebSocket!"
        assert first_call_type == "message"
        assert first_call_kwargs["sender_websocket"] == mock_websocket
        assert first_call_kwargs["skip_self"] == True

        # Verify second call (disconnect notification)
        assert "content" in second_call_data
        assert "Test User left the chat" in second_call_data["content"]
        assert second_call_type == "message"
        # Disconnect broadcast doesn't use a sender_websocket since the connection is already gone
        assert "sender_websocket" not in second_call_kwargs or second_call_kwargs["sender_websocket"] is None
    
    @pytest.mark.asyncio
    async def test_websocket_disconnect_handling(self, monkeypatch, mock_websocket):
        """Test WebSocket disconnect handling"""
        # Create a complete mock manager with all required async methods
        mock_manager = MagicMock()
        
        # Track all method calls with their arguments
        call_tracker = {}
        
        # Create async functions for all methods that will be awaited
        async def mock_auth_connect(websocket):
            call_tracker['auth_connect'] = True
            return None
            
        async def mock_send_personal(message, websocket):
            call_tracker['send_personal'] = message
            return None
        
        # Updated mock_broadcast to match new signature with data dict and type
        async def mock_broadcast(data, type, sender_websocket=None, skip_self=True):
            call_tracker['broadcast'] = {
                'data': data,
                'type': type,
                'sender_websocket': sender_websocket,
                'skip_self': skip_self
            }
            return None
        
        # Assign the async functions to the manager methods
        mock_manager.auth_connect = mock_auth_connect
        mock_manager.send_personal_message = mock_send_personal
        mock_manager.broadcast = mock_broadcast
        
        # Setup non-async method
        mock_manager.disconnect = MagicMock()
        mock_manager.active_connections = [mock_websocket]
        
        # Patch the manager in the API
        monkeypatch.setattr("api.api.chatConnectionManager", mock_manager)
        
        # Make sure state.user is properly configured
        mock_websocket.state.user = {"name": "Test User"}
        
        # First a successful message then a disconnect
        mock_websocket.receive_text = AsyncMock(side_effect=[
            "Hello, WebSocket!",
            WebSocketDisconnect()
        ])
        
        try:
            # Call the WebSocket endpoint
            await api_router.routes[-1].endpoint(mock_websocket)
        except Exception as e:
            # Print the exact error for debugging
            print(f"Unexpected error during test: {str(e)}")
            raise
        
        # Verify disconnect was handled
        assert mock_manager.disconnect.called
        
        # Check that the broadcast method was called with the disconnect message
        assert 'broadcast' in call_tracker
        assert call_tracker['broadcast']['type'] == "message"
        assert "Test User left the chat" in call_tracker['broadcast']['data']['content']
    
    @pytest.mark.asyncio
    async def test_websocket_exception_handling(self, monkeypatch, mock_websocket):
        """Test WebSocket general exception handling"""
        # Create a mock connection manager
        mock_manager = MagicMock()
        
        # Make auth_connect raise an exception to test the exception handler
        async def mock_auth_connect(websocket):
            raise Exception("Test connection error")
            
        mock_manager.auth_connect = mock_auth_connect
        mock_manager.disconnect = MagicMock()
        mock_manager.active_connections = [mock_websocket]
        
        # Mock the logger
        mock_logger = MagicMock()
        
        # Patch both the connection manager and logger
        monkeypatch.setattr("api.api.chatConnectionManager", mock_manager)
        monkeypatch.setattr("api.api.logger", mock_logger)
        
        # Call the WebSocket endpoint
        try:
            await api_router.routes[-1].endpoint(mock_websocket)
        except Exception as e:
            print(f"Unexpected exception: {e}")
        
        # Check that the exception was logged
        assert mock_logger.error.call_count == 1
        assert "WebSocket error" in mock_logger.error.call_args[0][0]
        
        # Check that disconnect was called to clean up
        assert mock_manager.disconnect.call_count == 1

    @pytest.mark.asyncio
    async def test_websocket_security_warning_for_auth_data(self, monkeypatch, mock_websocket):
        """Test security warning is sent when authentication data is detected in messages"""
        # Create a mock connection manager with AsyncMock methods
        mock_manager = MagicMock()
        mock_manager.auth_connect = AsyncMock()
        mock_manager.send_personal_message = AsyncMock()
        
        # Track broadcast calls to ensure they don't happen
        broadcast_calls = []
        async def mock_broadcast(data, type, **kwargs):
            broadcast_calls.append((data, type, kwargs))
            return None
        
        mock_manager.broadcast = mock_broadcast
        mock_manager.active_connections = []
        
        # Patch the ChatConnectionManager in api.py
        monkeypatch.setattr("api.api.chatConnectionManager", mock_manager)
        
        # Set up the mock to return a message with authentication data, then a normal message, then disconnect
        mock_websocket.receive_text = AsyncMock(side_effect=[
            "here is my token: xyz123",  # Message containing sensitive data
            "Hello, normal message",     # Normal message
            WebSocketDisconnect()
        ])
        
        # Make sure state.user is properly configured
        mock_websocket.state.user = {"name": "Test User"}
        
        # Call the WebSocket endpoint
        try:
            await api_router.routes[-1].endpoint(mock_websocket)
        except Exception as e:
            print(f"Expected exception: {e}")
        
        # Fix the spelling error - "chat" not "chatt"
        assert mock_manager.send_personal_message.call_args_list[0][0][0] == "!!! Security warning: Authentication data should not be sent in chat messages !!!"
        
        # Verify normal acknowledgment was sent for the second message
        assert mock_manager.send_personal_message.call_args_list[1][0][0] == "You sent: Hello, normal message"
        
        # Verify broadcast was called only once (for the normal message) and not for the sensitive one
        assert len(broadcast_calls) == 2  # One for the normal message, one for disconnect
        
        # Get the arguments of the first broadcast call
        first_call_data = broadcast_calls[0][0]  # Data argument
        
        # Verify it only contains the normal message, not the token message
        assert "content" in first_call_data
        assert first_call_data["content"] == "Test User: Hello, normal message"
        assert "token" not in first_call_data["content"]