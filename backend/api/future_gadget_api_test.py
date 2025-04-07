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
def setup_fgl_service():
    with patch("api.future_gadget_api.fgl_service") as mock_service:
        # Current timestamp
        current_time = datetime.datetime.now().isoformat()
        
        # Dummy experiment that already exists
        experiment_data = {
            "id": "FG-01",
            "name": "Phone Microwave",
            "description": "A microwave that sends text messages to the past",
            "status": "completed",
            "creator_id": "001",
            "collaborators": [],
            "world_line_change": 0.337192,
            "timestamp": current_time
        }
        mock_service.get_all_experiments.return_value = [experiment_data]
        mock_service.get_experiment_by_id.return_value = experiment_data
        mock_service.create_experiment.return_value = {
            "id": "FG-02",
            "name": "New Experiment",
            "description": "Test experiment",
            "status": "planned",
            "creator_id": "001",
            "collaborators": [],
            "world_line_change": 0.409431,
            "timestamp": current_time
        }
        mock_service.update_experiment.return_value = {
            "id": "FG-01",
            "name": "Updated Experiment",
            "description": "Updated description",
            "status": "completed",
            "creator_id": "001",
            "collaborators": [],
            "world_line_change": 0.571024,
            "timestamp": current_time
        }
        mock_service.delete_experiment.return_value = True
        
        # Mock divergence reading data for worldline calculations
        mock_service.get_all_divergence_readings.return_value = [
            {
                "id": "DR-001",
                "reading": 1.048596,
                "status": "steins_gate",
                "recorded_by": "Rintaro Okabe",
                "notes": "Steins;Gate worldline"
            }
        ]
        
        yield mock_service

# Add this fixture at the module level, outside of any class

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


class TestExperimentEndpoints:
    """Test the experiment endpoints with updated paths and fields"""

    def test_get_all_experiments(self, client_with_overridden_dependencies, setup_fgl_service):
        current_time = datetime.datetime.now().isoformat()
        with patch("api.future_gadget_api.fgl_service.get_all_experiments", return_value=[
            {
                "id": "EXP-001",
                "name": "Phone Microwave",
                "description": "Send messages to the past",
                "status": "in_progress",
                "creator_id": "001",
                "collaborators": ["002", "003"],
                "results": None,
                "world_line_change": 0.337192,
                "timestamp": current_time
            }
        ]):
            test_client, _ = client_with_overridden_dependencies
            # Use the correct lab-experiments route
            response = test_client.get(f"{API_PREFIX}/lab-experiments")
            assert response.status_code == 200
            experiments = response.json()
            assert isinstance(experiments, list)
            assert experiments[0]["id"] == "EXP-001"
            assert experiments[0]["world_line_change"] == 0.337192
            assert "timestamp" in experiments[0]

    def test_get_experiment_by_id(self, client_with_overridden_dependencies, setup_fgl_service):
        current_time = datetime.datetime.now().isoformat()
        with patch("api.future_gadget_api.fgl_service.get_experiment_by_id", return_value={
            "id": "EXP-001",
            "name": "Phone Microwave",
            "description": "Send messages to the past",
            "status": "in_progress",
            "creator_id": "001",
            "collaborators": ["002", "003"],
            "results": None,
            "world_line_change": 0.409431,
            "timestamp": current_time
        }):
            test_client, _ = client_with_overridden_dependencies
            # Updated from /experiments to /lab-experiments
            response = test_client.get(f"{API_PREFIX}/lab-experiments/EXP-001")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "EXP-001"
            assert data["world_line_change"] == 0.409431
            assert "timestamp" in data

    def test_create_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        current_time = datetime.datetime.now().isoformat()
        # Mock both broadcast methods
        with patch("api.future_gadget_api.experiment_connection_manager.broadcast", AsyncMock()), \
             patch("api.future_gadget_api.broadcast_worldline_status", AsyncMock()), \
             patch("api.future_gadget_api.fgl_service.create_experiment", return_value={
                "id": "EXP-002",
                "name": "Time Leap Machine",
                "description": "Transfer memories to the past",
                "status": "planned",
                "creator_id": "001",
                "collaborators": ["002"],
                "results": None,
                "world_line_change": 0.000337,
                "timestamp": current_time
            }):
            test_client, _ = client_with_overridden_dependencies
            new_experiment = {
                "name": "Time Leap Machine",
                "description": "Transfer memories to the past",
                "status": "planned",
                "creator_id": "001",
                "collaborators": ["002"],
                "results": None,
                "world_line_change": 0.000337
            }
            # Updated from /experiments to /lab-experiments
            response = test_client.post(f"{API_PREFIX}/lab-experiments", json=new_experiment)
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == "EXP-002"
            assert data["world_line_change"] == 0.000337
            assert "timestamp" in data
            
            # Verify broadcast_worldline_status was called
            from api.future_gadget_api import broadcast_worldline_status
            assert broadcast_worldline_status.called

    def test_create_experiment_with_string_world_line_change(self, client_with_overridden_dependencies, setup_fgl_service):
        current_time = datetime.datetime.now().isoformat()
        with patch("api.future_gadget_api.experiment_connection_manager.broadcast", AsyncMock()), \
             patch("api.future_gadget_api.broadcast_worldline_status", AsyncMock()), \
             patch("api.future_gadget_api.fgl_service.create_experiment", return_value={
                "id": "EXP-002",
                "name": "Time Leap Machine",
                "description": "Transfer memories to the past",
                "status": "planned",
                "creator_id": "001",
                "collaborators": ["002"],
                "results": None,
                "world_line_change": 0.000337,
                "timestamp": current_time
            }):
            test_client, _ = client_with_overridden_dependencies
            new_experiment = {
                "name": "Time Leap Machine",
                "description": "Transfer memories to the past",
                "status": "planned",
                "creator_id": "001",
                "collaborators": ["002"],
                "results": None,
                "world_line_change": "0.000337"  # String value to test conversion
            }
            response = test_client.post(f"{API_PREFIX}/lab-experiments", json=new_experiment)
            assert response.status_code == 201
            data = response.json()
            assert data["world_line_change"] == 0.000337  # Should be converted to float

    def test_update_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        current_time = datetime.datetime.now().isoformat()
        with patch("api.future_gadget_api.experiment_connection_manager.broadcast", AsyncMock()), \
             patch("api.future_gadget_api.broadcast_worldline_status", AsyncMock()), \
             patch("api.future_gadget_api.fgl_service.update_experiment", return_value={
                "id": "EXP-001",
                "name": "Phone Microwave (Name subject to change)",
                "description": "Send messages to the past",
                "status": "completed",
                "creator_id": "001",
                "collaborators": ["002", "003"],
                "results": "Successful test with banana",
                "world_line_change": 0.571024,
                "timestamp": current_time
            }):
            test_client, _ = client_with_overridden_dependencies
            update_data = {
                "name": "Phone Microwave (Name subject to change)",
                "status": "completed",
                "results": "Successful test with banana",
                "world_line_change": 0.571024
            }
            # Updated from /experiments to /lab-experiments
            response = test_client.put(f"{API_PREFIX}/lab-experiments/EXP-001", json=update_data)
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "Phone Microwave (Name subject to change)"
            assert data["status"] == "completed"
            assert data["world_line_change"] == 0.571024
            
            # Verify broadcast_worldline_status was called
            from api.future_gadget_api import broadcast_worldline_status
            assert broadcast_worldline_status.called

    def test_delete_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.experiment_connection_manager.broadcast", AsyncMock()), \
             patch("api.future_gadget_api.broadcast_worldline_status", AsyncMock()), \
             patch("api.future_gadget_api.fgl_service.delete_experiment", return_value=True):
            test_client, _ = client_with_overridden_dependencies
            # Updated from /experiments to /lab-experiments
            response = test_client.delete(f"{API_PREFIX}/lab-experiments/EXP-001")
            assert response.status_code == 200
            data = response.json()
            assert "successfully deleted" in data["message"].lower()
            
            # Verify broadcast_worldline_status was called
            from api.future_gadget_api import broadcast_worldline_status
            assert broadcast_worldline_status.called


class TestExperimentWebSocketEndpoints:
    """Test the Experiment WebSocket endpoints for real-time updates"""
    
    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket object with all necessary attributes"""
        mock_ws = MagicMock()
        
        # Set up the state with user info
        mock_ws.state = MagicMock()
        mock_ws.state.user = {"name": "Test User", "sub": "test-id", "roles": ["Admin"]}
        
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
    
    @pytest.mark.asyncio
    async def test_experiment_websocket_connection(self, monkeypatch, mock_websocket):
        """Test experiment WebSocket connection and authentication"""
        # Create a mock connection manager
        mock_manager = MagicMock()
        
        # Use AsyncMock for auth_connect
        mock_auth_connect = AsyncMock()
        async def side_effect(websocket):
            return None
        mock_auth_connect.side_effect = side_effect
        
        # Assign the AsyncMock to the manager
        mock_manager.auth_connect = mock_auth_connect
        
        # Patch the experiment connection manager
        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        
        # Mock logger to avoid real logging
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())
        
        # Get the WebSocket endpoint function
        from api.future_gadget_api import experiment_websocket_endpoint
        
        # Make websocket.receive_text raise a disconnect to end the handler
        mock_websocket.receive_text = AsyncMock(side_effect=WebSocketDisconnect())
        
        # Call the WebSocket endpoint
        try:
            await experiment_websocket_endpoint(mock_websocket)
        except Exception as e:
            print(f"Expected exception: {e}")
        
        # Verify the connection was authenticated
        assert mock_auth_connect.called
        assert mock_auth_connect.call_args[0][0] == mock_websocket
    
    @pytest.mark.asyncio
    async def test_experiment_websocket_disconnect_handling(self, monkeypatch, mock_websocket):
        """Test experiment WebSocket disconnect handling"""
        # Create a mock connection manager
        mock_manager = MagicMock()
        
        # Simple async function implementation
        async def mock_auth_connect(websocket):
            # Add websocket to active connections to test disconnect
            mock_manager.active_connections.append(websocket)
            return None
            
        def mock_disconnect(websocket):
            if websocket in mock_manager.active_connections:
                mock_manager.active_connections.remove(websocket)
            mock_disconnect.call_count += 1
        
        # Initialize tracking attributes
        mock_disconnect.call_count = 0
        mock_manager.active_connections = []
        mock_manager.auth_connect = mock_auth_connect
        mock_manager.disconnect = mock_disconnect
        
        # Set up receive_text to raise WebSocketDisconnect
        mock_websocket.receive_text = AsyncMock(side_effect=WebSocketDisconnect())
        
        # Patch the experiment connection manager
        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())
        
        # Get the WebSocket endpoint function
        from api.future_gadget_api import experiment_websocket_endpoint
        
        # Call the WebSocket endpoint
        await experiment_websocket_endpoint(mock_websocket)
        
        # Verify disconnect was handled
        assert mock_disconnect.call_count == 1
    
    @pytest.mark.asyncio
    async def test_experiment_websocket_exception_handling(self, monkeypatch, mock_websocket):
        """Test experiment WebSocket general exception handling"""
        # Create a mock connection manager
        mock_manager = MagicMock()
        
        # Mock auth_connect to raise an exception
        async def mock_auth_connect(websocket):
            raise Exception("Test auth error")
            
        def mock_disconnect(websocket):
            mock_disconnect.call_count += 1
            
        # Initialize tracking
        mock_disconnect.call_count = 0
        mock_manager.auth_connect = mock_auth_connect
        mock_manager.disconnect = mock_disconnect
        mock_manager.active_connections = [mock_websocket]
        
        # Patch the experiment connection manager and logger
        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        mock_logger = MagicMock()
        monkeypatch.setattr("api.future_gadget_api.logger", mock_logger)
        
        # Get the WebSocket endpoint function
        from api.future_gadget_api import experiment_websocket_endpoint
        
        # Call the WebSocket endpoint
        await experiment_websocket_endpoint(mock_websocket)
        
        # Verify exception was caught and logged
        assert mock_logger.error.call_count == 1
        assert "Test auth error" in str(mock_logger.error.call_args[0][0])
        # Verify disconnect was called to clean up
        assert mock_disconnect.call_count == 1
    
    @pytest.mark.asyncio
    async def test_broadcast_crud_operations(self, monkeypatch, mock_websocket):
        """Test broadcasting CRUD operations data through WebSockets"""
        # Create a test experiment data with new fields
        test_experiment = {
            "id": "EXP-001",
            "name": "Test Experiment",
            "status": "in_progress",
            "world_line_change": 0.337192,
            "timestamp": datetime.datetime.now().isoformat(),
            "creator_id": "Rintaro Okabe",
            "description": "Testing worldline modifications"
        }
        
        # Create a mock connection manager
        mock_manager = MagicMock()
        
        # Track broadcast calls with a function that stores arguments
        broadcast_args = []
        async def mock_broadcast(data, type, sender_websocket=None, skip_self=True):
            broadcast_args.append((data, type, sender_websocket, skip_self))
            return None
        
        mock_manager.broadcast = mock_broadcast
        mock_manager.active_connections = [mock_websocket]
        
        # Patch the experiment connection manager
        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        monkeypatch.setattr("api.future_gadget_api.broadcast_worldline_status", AsyncMock())
        
        # Bypass security by mocking the required_roles decorator
        monkeypatch.setattr("api.future_gadget_api.required_roles", lambda roles: lambda f: f)
        
        # Import the API function after patching
        from api.future_gadget_api import create_experiment
        
        # Create a mock for the experiment model and token
        mock_experiment = MagicMock()
        mock_experiment.model_dump.return_value = test_experiment
        mock_token = MagicMock()
        mock_token.roles = ["Admin"]  # Add roles to token
        
        # Mock the username property that's accessed in the create_experiment function
        mock_username = "test.user@example.com"
        mock_token.preferred_username = mock_username
        
        # Patch the database service
        with patch("api.future_gadget_api.fgl_service.create_experiment", return_value=test_experiment):
            # Call the function with explicit token parameter 
            result = await create_experiment(experiment=mock_experiment, token=mock_token)
            
            # Verify result
            assert result == test_experiment
            
            # Verify broadcast was called
            assert len(broadcast_args) == 1
            
            # Create expected broadcast data object (with the added fields)
            expected_broadcast_data = {
                **test_experiment,  # All the original experiment data
                "actor": mock_username,  # Username from token
                "type": "create"     # Type field added in broadcast
            }
            
            # Check broadcast data matches expected structure
            assert broadcast_args[0][0] == expected_broadcast_data  # data
            assert broadcast_args[0][1] == "create"  # type
            
            # Also verify worldline status broadcast was called
            from api.future_gadget_api import broadcast_worldline_status
            assert broadcast_worldline_status.called


class TestWorldlineEndpoints:
    """Test the new worldline status endpoints and features"""
    
    def test_get_worldline_status(self, client_with_overridden_dependencies, setup_fgl_service):
        """Test the worldline-status endpoint returns correct data"""
        # Mock the calculate_worldline_status function response
        mock_status = {
            "current_worldline": 1.337192,
            "base_worldline": 1.0,
            "total_divergence": 0.337192,
            "experiment_count": 5,
            "last_experiment_timestamp": "2025-04-07T12:00:00.000Z",
            "closest_reading": {
                "value": 1.382733,
                "status": "beta",
                "recorded_by": "Suzuha Amane",
                "notes": "Beta worldline variant",
                "distance": 0.045541
            }
        }
        
        with patch("api.future_gadget_api.calculate_worldline_status", return_value=mock_status):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/worldline-status")
            assert response.status_code == 200
            data = response.json()
            
            # Verify core worldline data
            assert data["current_worldline"] == 1.337192
            assert data["base_worldline"] == 1.0
            assert data["total_divergence"] == 0.337192
            assert data["experiment_count"] == 5
            
            # Verify closest reading
            assert "closest_reading" in data
            assert data["closest_reading"]["value"] == 1.382733
            assert data["closest_reading"]["status"] == "beta"
            
            # Verify timestamp was added
            assert "timestamp" in data
    
    def test_get_worldline_history(self, client_with_overridden_dependencies, setup_fgl_service):
        """Test the worldline-history endpoint returns the correct historical progression"""
        # Mock the sorted experiments and history response
        sorted_experiments = []
        mock_history = [
            {
                "current_worldline": 1.0,
                "base_worldline": 1.0,
                "total_divergence": 0.0,
                "experiment_count": 0,
                "timestamp": "2025-04-07T12:00:00.000Z"
            },
            {
                "current_worldline": 1.337192,
                "base_worldline": 1.0,
                "total_divergence": 0.337192,
                "experiment_count": 1,
                "timestamp": "2025-04-07T12:00:00.000Z"
            }
        ]
        
        with patch("api.future_gadget_api.fgl_service.get_all_experiments", return_value=sorted_experiments), \
             patch("api.future_gadget_api.calculate_worldline_status", side_effect=[mock_history[0], mock_history[1]]):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/worldline-history")
            assert response.status_code == 200
            data = response.json()
            
            # Verify it returns an array with expected entries
            assert isinstance(data, list)
            assert "current_worldline" in data[0]
            assert "base_worldline" in data[0]
            assert "timestamp" in data[0]
    
    @pytest.mark.asyncio
    async def test_broadcast_worldline_status(self, monkeypatch, mock_websocket):
        """Test the broadcast_worldline_status function correctly calculates and broadcasts worldline status"""
        # Create mocks
        mock_worldline_manager = MagicMock()
        broadcast_args = []
        
        # Define mock async broadcast method
        async def mock_broadcast(data, type, sender=None):
            broadcast_args.append((data, type, sender))
            return None
        
        # Define mock calculate method
        def mock_calculate(experiments, readings=None):
            return {
                "current_worldline": 1.337192,
                "base_worldline": 1.0,
                "total_divergence": 0.337192,
                "experiment_count": len(experiments),
                "last_experiment_timestamp": None
            }
        
        # Set up test experiment
        test_experiment = {
            "id": "EXP-001",
            "name": "Test Experiment",
            "world_line_change": 0.337192
        }
        
        # Apply patches
        mock_worldline_manager.broadcast = mock_broadcast
        monkeypatch.setattr("api.future_gadget_api.worldline_connection_manager", mock_worldline_manager)
        monkeypatch.setattr("api.future_gadget_api.calculate_worldline_status", mock_calculate)
        monkeypatch.setattr("api.future_gadget_api.fgl_service.get_all_experiments", MagicMock(return_value=[]))
        monkeypatch.setattr("api.future_gadget_api.fgl_service.get_all_divergence_readings", MagicMock(return_value=[]))
        
        # Import the function after patching
        from api.future_gadget_api import broadcast_worldline_status
        
        # Test with experiment included
        result = await broadcast_worldline_status(experiment=test_experiment)
        
        # Verify the broadcast was called with correct parameters
        assert len(broadcast_args) == 1
        assert broadcast_args[0][1] == "worldline_update"  # type
        
        # Verify result contains preview flag when experiment is provided
        assert "includes_preview" in result
        assert result["includes_preview"] == True
        assert "preview_experiment" in result
        assert result["preview_experiment"]["name"] == test_experiment["name"]
        
        # Test without experiment (normal post-save broadcast)
        broadcast_args.clear()
        result = await broadcast_worldline_status()
        
        # Verify broadcast was still called
        assert len(broadcast_args) == 1
        
        # Verify no preview flag when no experiment provided
        assert "includes_preview" not in result
    
    @pytest.mark.asyncio
    async def test_worldline_websocket_endpoint(self, monkeypatch, mock_websocket):
        """Test the worldline status WebSocket endpoint handles different user roles correctly"""
        # Set up mock connection manager
        mock_manager = MagicMock()
        sent_messages = []
        
        # Define async methods
        async def mock_auth_connect(websocket):
            return None
        
        async def mock_send_personal_message(message, websocket):
            sent_messages.append(message)
        
        # Assign async methods
        mock_manager.auth_connect = mock_auth_connect
        mock_manager.send_personal_message = mock_send_personal_message
        
        # Apply patches
        monkeypatch.setattr("api.future_gadget_api.worldline_connection_manager", mock_manager)
        monkeypatch.setattr("api.future_gadget_api.calculate_worldline_status", MagicMock(return_value={
            "current_worldline": 1.337192,
            "base_worldline": 1.0,
            "total_divergence": 0.337192,
            "experiment_count": 3
        }))
        monkeypatch.setattr("api.future_gadget_api.fgl_service.get_all_experiments", MagicMock(return_value=[]))
        monkeypatch.setattr("api.future_gadget_api.fgl_service.get_all_divergence_readings", MagicMock(return_value=[]))
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())
        
        # Import the WebSocket endpoint
        from api.future_gadget_api import worldline_status_websocket_endpoint
        
        # Test with regular user - should send status automatically on message
        # Set up user roles
        mock_websocket.state = MagicMock()
        mock_websocket.state.user = MagicMock()
        mock_websocket.state.user.roles = ["User"]
        
        # Set up to receive one message then disconnect
        mock_websocket.receive_text = AsyncMock(side_effect=["ping", WebSocketDisconnect()])
        
        # Call the endpoint
        try:
            await worldline_status_websocket_endpoint(mock_websocket)
        except WebSocketDisconnect:
            pass
        
        # Verify response was sent
        assert len(sent_messages) == 1
        assert "current_worldline" in sent_messages[0]
        assert "timestamp" in sent_messages[0]
        
        # Test with Admin user - should not send automatic status
        mock_websocket.state.user.roles = ["Admin"]
        sent_messages.clear()
        
        # Reset receive_text
        mock_websocket.receive_text = AsyncMock(side_effect=["ping", WebSocketDisconnect()])
        
        # Call the endpoint again
        try:
            await worldline_status_websocket_endpoint(mock_websocket)
        except WebSocketDisconnect:
            pass
        
        # Verify no automatic response to Admin
        assert len(sent_messages) == 0