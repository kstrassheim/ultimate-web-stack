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

    def test_get_divergence_readings(self, client_with_overridden_dependencies, setup_fgl_service):
        """Test the divergence-readings endpoint available to all authenticated users"""
        # Mock sample readings data
        sample_readings = [
            {
                "id": "DR-001",
                "reading": 1.048596,
                "status": "steins_gate",
                "recorded_by": "Rintaro Okabe",
                "notes": "Steins;Gate worldline"
            },
            {
                "id": "DR-002",
                "reading": 0.571024,
                "status": "alpha",
                "recorded_by": "Rintaro Okabe",
                "notes": "Alpha worldline"
            },
            {
                "id": "DR-003",
                "reading": 1.382733,
                "status": "beta",
                "recorded_by": "Suzuha Amane",
                "notes": "Beta worldline variant"
            }
        ]
        
        with patch("api.future_gadget_api.fgl_service.get_all_divergence_readings", return_value=sample_readings):
            test_client, _ = client_with_overridden_dependencies
            
            # Test 1: Get all readings (no filters)
            response = test_client.get(f"{API_PREFIX}/divergence-readings")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 3
            assert data[0]["id"] == "DR-001"
            assert data[0]["reading"] == 1.048596
            assert data[0]["status"] == "steins_gate"
            
            # Test 2: Filter by status
            response = test_client.get(f"{API_PREFIX}/divergence-readings?status=alpha")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["status"] == "alpha"
            assert data[0]["reading"] == 0.571024
            
            # Test 3: Filter by recorded_by
            response = test_client.get(f"{API_PREFIX}/divergence-readings?recorded_by=Suzuha%20Amane")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["recorded_by"] == "Suzuha Amane"
            assert data[0]["id"] == "DR-003"
            
            # Test 4: Filter by minimum value
            response = test_client.get(f"{API_PREFIX}/divergence-readings?min_value=1.0")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert all(reading["reading"] >= 1.0 for reading in data)
            
            # Test 5: Filter by maximum value
            response = test_client.get(f"{API_PREFIX}/divergence-readings?max_value=1.0")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["reading"] < 1.0
            assert data[0]["status"] == "alpha"
            
            # Test 6: Combine multiple filters
            response = test_client.get(f"{API_PREFIX}/divergence-readings?min_value=1.0&recorded_by=Rintaro%20Okabe")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["id"] == "DR-001"
            assert data[0]["reading"] >= 1.0
            assert data[0]["recorded_by"] == "Rintaro Okabe"

    def test_non_admin_access_to_divergence_readings(self, setup_fgl_service):
        """Test non-admin users can access the divergence readings endpoint"""
        # Create special test app with normal user token
        test_app = FastAPI()
        mock_token = SimpleNamespace(roles=["User"])  # Non-admin token

        async def override_security_dependency():
            return mock_token

        # Set up overrides
        test_app.dependency_overrides[azure_scheme] = override_security_dependency
        test_app.include_router(future_gadget_api_router)
        test_client = TestClient(test_app)
        
        # Mock readings data
        sample_readings = [
            {
                "id": "DR-001",
                "reading": 1.048596,
                "status": "steins_gate",
                "recorded_by": "Rintaro Okabe"
            }
        ]
        
        with patch("api.future_gadget_api.fgl_service.get_all_divergence_readings", return_value=sample_readings):
            # Normal user should be able to access this endpoint
            response = test_client.get(f"{API_PREFIX}/divergence-readings")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["id"] == "DR-001"


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
        """Test broadcasting CRUD operations data through WebSockets using broadcast_server"""
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
        broadcast_server_args = []
        async def mock_broadcast_server(data, type, username=None):
            broadcast_server_args.append((data, type, username))
            return None
        
        # Assign the mock to the manager
        mock_manager.broadcast_server = mock_broadcast_server
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
            
            # Verify broadcast_server was called
            assert len(broadcast_server_args) == 1
            
            # Check broadcast data matches expected structure
            assert broadcast_server_args[0][0]["id"] == test_experiment["id"]
            assert broadcast_server_args[0][0]["name"] == test_experiment["name"]
            assert broadcast_server_args[0][0]["type"] == "create"  # type field added in broadcast
            assert broadcast_server_args[0][1] == "create"  # type parameter
            assert broadcast_server_args[0][2] == f"Lab Member: {mock_username}"  # username parameter
            
            # Also verify worldline status broadcast was called
            from api.future_gadget_api import broadcast_worldline_status
            assert broadcast_worldline_status.called
            # Verify username was passed to broadcast_worldline_status
            assert broadcast_worldline_status.call_args[1]["username"] == f"Lab Member: {mock_username}"


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
        """Test the broadcast_worldline_status function with new broadcast_server method"""
        # Create mocks
        mock_worldline_manager = MagicMock()
        broadcast_server_args = []
        
        # Define mock async broadcast_server method
        async def mock_broadcast_server(data, type, username="SERVER"):
            broadcast_server_args.append((data, type, username))
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
        mock_worldline_manager.broadcast_server = mock_broadcast_server
        monkeypatch.setattr("api.future_gadget_api.worldline_connection_manager", mock_worldline_manager)
        monkeypatch.setattr("api.future_gadget_api.calculate_worldline_status", mock_calculate)
        monkeypatch.setattr("api.future_gadget_api.fgl_service.get_all_experiments", MagicMock(return_value=[]))
        monkeypatch.setattr("api.future_gadget_api.fgl_service.get_all_divergence_readings", MagicMock(return_value=[]))
        
        # Import the function after patching
        from api.future_gadget_api import broadcast_worldline_status
        
        # Test with experiment included and custom username
        custom_username = "Lab Member: Kurisu Makise"
        custom_message = "New experiment added"
        result = await broadcast_worldline_status(
            experiment=test_experiment, 
            username=custom_username,
            custom_message=custom_message
        )
        
        # Verify the broadcast_server was called with correct parameters
        assert len(broadcast_server_args) == 1
        assert broadcast_server_args[0][1] == "worldline_update"  # type
        assert broadcast_server_args[0][2] == custom_username  # username
        
        # Check that message_type and custom_message fields are correctly set in the data
        assert broadcast_server_args[0][0]["message_type"] == "worldline_update"
        assert broadcast_server_args[0][0]["message"] == custom_message
        
        # Verify result contains preview flag when experiment is provided
        assert "includes_preview" in result
        assert result["includes_preview"] == True
        assert "preview_experiment" in result
        assert result["preview_experiment"]["name"] == test_experiment["name"]
        
        # Test without experiment and with default username
        broadcast_server_args.clear()
        result = await broadcast_worldline_status()
        
        # Verify broadcast was still called with default username
        assert len(broadcast_server_args) == 1
        assert broadcast_server_args[0][2] == "Divergence Meter"  # Default username
        
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

# ---------------------------------------------------------------------------
# Coverage gap closures (issue #147)
# ---------------------------------------------------------------------------

import os
import importlib.util
from pydantic import ValidationError

from api.future_gadget_api import (
    ExperimentCreate,
    ExperimentUpdate,
    get_reading_value,
)


class TestNonMockServiceInitialization:
    """Cover the module-level `else` branch that builds the real
    Cosmos-backed FutureGadgetLabDataService when MOCK is off.

    The module is executed fresh (under a different module name) with
    ``common.config.mock_enabled`` patched to False and a stubbed
    ``FutureGadgetLabDataService`` constructor, so no network or real
    Cosmos client is ever touched.
    """

    def _load_module_non_mock(self, monkeypatch, tfconfig_dict):
        import common.config as config_module
        import db.future_gadget_lab_data_service as fgl_db

        monkeypatch.setattr(config_module, "mock_enabled", False)
        monkeypatch.setattr(config_module, "tfconfig", tfconfig_dict)

        fake_service = MagicMock(name="fgl_service")
        fake_cls = MagicMock(return_value=fake_service)
        monkeypatch.setattr(fgl_db, "FutureGadgetLabDataService", fake_cls)

        module_path = os.path.join(os.path.dirname(__file__), "future_gadget_api.py")
        spec = importlib.util.spec_from_file_location(
            "api.future_gadget_api_nomock", module_path
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module, fake_cls, fake_service

    def test_uses_cosmos_account_endpoint_when_present(self, monkeypatch):
        tfconfig = {
            "cosmos_account_endpoint": {"value": "https://acct.documents.azure.com:443/"},
            "cosmos_database_name": {"value": "db"},
            "cosmos_container_name": {"value": "container"},
        }
        module, fake_cls, fake_service = self._load_module_non_mock(monkeypatch, tfconfig)
        fake_cls.assert_called_once_with(
            cosmos_account_uri="https://acct.documents.azure.com:443/",
            cosmos_database="db",
            cosmos_container="container",
        )
        assert module.fgl_service is fake_service

    def test_derives_endpoint_from_hostname_when_endpoint_missing(self, monkeypatch):
        tfconfig = {
            "cosmos_account_hostname": {"value": "acct.documents.azure.com"},
            "cosmos_database_name": {"value": "db"},
            "cosmos_container_name": {"value": "container"},
        }
        module, fake_cls, _ = self._load_module_non_mock(monkeypatch, tfconfig)
        fake_cls.assert_called_once_with(
            cosmos_account_uri="https://acct.documents.azure.com:443/",
            cosmos_database="db",
            cosmos_container="container",
        )

    def test_missing_hostname_raises_runtime_error(self, monkeypatch):
        tfconfig = {
            "cosmos_database_name": {"value": "db"},
            "cosmos_container_name": {"value": "container"},
        }
        with pytest.raises(RuntimeError, match="cosmos_account_hostname"):
            self._load_module_non_mock(monkeypatch, tfconfig)

    def test_missing_database_name_raises_runtime_error(self, monkeypatch):
        tfconfig = {
            "cosmos_account_endpoint": {"value": "https://acct.documents.azure.com:443/"},
            "cosmos_container_name": {"value": "container"},
        }
        with pytest.raises(RuntimeError, match="cosmos_database_name"):
            self._load_module_non_mock(monkeypatch, tfconfig)

    def test_missing_container_name_raises_runtime_error(self, monkeypatch):
        tfconfig = {
            "cosmos_account_endpoint": {"value": "https://acct.documents.azure.com:443/"},
            "cosmos_database_name": {"value": "db"},
        }
        with pytest.raises(RuntimeError, match="cosmos_container_name"):
            self._load_module_non_mock(monkeypatch, tfconfig)


class TestWorldLineChangeValidators:
    """Cover the string->float validators on the pydantic models."""

    def test_experiment_create_accepts_numeric_string(self):
        exp = ExperimentCreate(
            name="X", description="Y", status="planned", creator_id="1",
            world_line_change="0.337192",
        )
        assert exp.world_line_change == 0.337192

    def test_experiment_create_rejects_non_numeric_string(self):
        with pytest.raises(ValidationError):
            ExperimentCreate(
                name="X", description="Y", status="planned", creator_id="1",
                world_line_change="not-a-float",
            )

    def test_experiment_update_none_passthrough(self):
        update = ExperimentUpdate(world_line_change=None)
        assert update.world_line_change is None

    def test_experiment_update_accepts_numeric_string(self):
        update = ExperimentUpdate(world_line_change="1.048596")
        assert update.world_line_change == 1.048596

    def test_experiment_update_rejects_non_numeric_string(self):
        with pytest.raises(ValidationError):
            ExperimentUpdate(world_line_change="abc")


class TestExperimentEndpointGaps:
    """404/500 branches and query-filter routing not previously exercised."""

    def test_get_all_experiments_with_name_and_status_filters(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch(
            "api.future_gadget_api.fgl_service.search_experiments", return_value=[{"id": "EXP-1"}]
        ) as mock_search:
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/lab-experiments?name=Phone&status=completed")
            assert response.status_code == 200
            assert response.json() == [{"id": "EXP-1"}]
            from db.future_gadget_lab_data_service import ExperimentStatus
            mock_search.assert_called_once_with(
                {"name": "Phone", "status": ExperimentStatus.COMPLETED}
            )

    def test_get_all_experiments_with_name_filter_only(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch(
            "api.future_gadget_api.fgl_service.search_experiments", return_value=[]
        ) as mock_search:
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/lab-experiments?name=Phone")
            assert response.status_code == 200
            mock_search.assert_called_once_with({"name": "Phone"})

    def test_get_all_experiments_with_status_filter_only(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch(
            "api.future_gadget_api.fgl_service.search_experiments", return_value=[]
        ) as mock_search:
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/lab-experiments?status=planned")
            assert response.status_code == 200
            from db.future_gadget_lab_data_service import ExperimentStatus
            mock_search.assert_called_once_with({"status": ExperimentStatus.PLANNED})

    def test_get_experiment_by_id_not_found(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch("api.future_gadget_api.fgl_service.get_experiment_by_id", return_value=None):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/lab-experiments/missing")
            assert response.status_code == 404
            assert "missing" in response.json()["detail"]

    def test_update_experiment_not_found(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch("api.future_gadget_api.fgl_service.get_experiment_by_id", return_value=None):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.put(
                f"{API_PREFIX}/lab-experiments/missing", json={"name": "New"}
            )
            assert response.status_code == 404

    def test_delete_experiment_not_found(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch("api.future_gadget_api.fgl_service.get_experiment_by_id", return_value=None):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.delete(f"{API_PREFIX}/lab-experiments/missing")
            assert response.status_code == 404

    def test_delete_experiment_failure_returns_500(
        self, client_with_overridden_dependencies, setup_fgl_service
    ):
        with patch(
            "api.future_gadget_api.fgl_service.get_experiment_by_id",
            return_value={"id": "EXP-1", "name": "PM"},
        ), patch(
            "api.future_gadget_api.fgl_service.delete_experiment", return_value=False
        ), patch(
            "api.future_gadget_api.experiment_connection_manager.broadcast_server", AsyncMock()
        ), patch(
            "api.future_gadget_api.broadcast_worldline_status", AsyncMock()
        ):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.delete(f"{API_PREFIX}/lab-experiments/EXP-1")
            assert response.status_code == 500
            assert "Failed to delete" in response.json()["detail"]


class TestWebSocketGaps:
    """WebSocket paths not previously exercised (issue #147)."""

    @pytest.fixture
    def mock_websocket(self):
        mock_ws = MagicMock()
        mock_ws.state = MagicMock()
        mock_ws.state.user = MagicMock()
        mock_ws.state.user.name = "Test User"
        mock_ws.state.user.sub = "test-id"
        mock_ws.state.user.roles = ["Admin"]

        async def mock_send_text(message):
            mock_ws.sent_messages = getattr(mock_ws, "sent_messages", [])
            mock_ws.sent_messages.append(message)

        async def mock_send_json(data):
            mock_ws.sent_json = getattr(mock_ws, "sent_json", [])
            mock_ws.sent_json.append(data)

        mock_ws.send_text = mock_send_text
        mock_ws.send_json = mock_send_json
        return mock_ws

    @pytest.mark.asyncio
    async def test_experiment_websocket_echoes_message(self, monkeypatch, mock_websocket):
        """A received text frame is echoed back prefixed with the channel name."""
        mock_manager = MagicMock()
        mock_manager.auth_connect = AsyncMock(return_value=None)
        mock_manager.send_personal_message = AsyncMock()
        mock_manager.active_connections = [mock_websocket]
        mock_manager.disconnect = MagicMock()

        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())

        mock_websocket.receive_text = AsyncMock(side_effect=["ping", WebSocketDisconnect()])

        from api.future_gadget_api import experiment_websocket_endpoint
        await experiment_websocket_endpoint(mock_websocket)

        mock_manager.send_personal_message.assert_called_once_with(
            "Experiment channel: ping", mock_websocket
        )

    @pytest.mark.asyncio
    async def test_worldline_websocket_exception_handling(self, monkeypatch, mock_websocket):
        """An unexpected error during worldline auth is logged and the socket
        is disconnected from the worldline manager."""
        mock_manager = MagicMock()

        async def mock_auth_connect(websocket):
            raise Exception("Worldline auth exploded")

        mock_manager.auth_connect = mock_auth_connect
        mock_manager.disconnect = MagicMock()
        mock_manager.active_connections = [mock_websocket]

        monkeypatch.setattr("api.future_gadget_api.worldline_connection_manager", mock_manager)
        mock_logger = MagicMock()
        monkeypatch.setattr("api.future_gadget_api.logger", mock_logger)

        from api.future_gadget_api import worldline_status_websocket_endpoint
        await worldline_status_websocket_endpoint(mock_websocket)

        assert mock_logger.error.call_count == 1
        assert "Worldline auth exploded" in str(mock_logger.error.call_args[0][0])
        mock_manager.disconnect.assert_called_once_with(mock_websocket)


class TestGetReadingValue:
    """Cover the value/string fallback branches of get_reading_value."""

    def test_falls_back_to_value_field(self):
        assert get_reading_value({"value": 2.5}) == 2.5

    def test_converts_numeric_string(self):
        assert get_reading_value({"reading": "1.048596"}) == 1.048596

    def test_non_numeric_string_returns_zero(self):
        assert get_reading_value({"reading": "not-a-float"}) == 0.0


class TestWebSocketExceptionBranchGaps:
    """Branch coverage: exception handlers where the socket is NOT tracked
    in active_connections (no disconnect call)."""

    @pytest.mark.asyncio
    async def test_experiment_websocket_exception_without_active_connection(self, monkeypatch):
        mock_ws = MagicMock()
        mock_ws.state = MagicMock()
        mock_ws.state.user = MagicMock()
        mock_ws.state.user.name = "Test User"

        mock_manager = MagicMock()

        async def mock_auth_connect(websocket):
            raise Exception("boom before registration")

        mock_manager.auth_connect = mock_auth_connect
        mock_manager.disconnect = MagicMock()
        mock_manager.active_connections = []  # socket never registered

        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())

        from api.future_gadget_api import experiment_websocket_endpoint
        await experiment_websocket_endpoint(mock_ws)

        mock_manager.disconnect.assert_not_called()

    @pytest.mark.asyncio
    async def test_worldline_websocket_exception_without_active_connection(self, monkeypatch):
        mock_ws = MagicMock()
        mock_ws.state = MagicMock()
        mock_ws.state.user = MagicMock()
        mock_ws.state.user.name = "Test User"

        mock_manager = MagicMock()

        async def mock_auth_connect(websocket):
            raise Exception("boom before registration")

        mock_manager.auth_connect = mock_auth_connect
        mock_manager.disconnect = MagicMock()
        mock_manager.active_connections = []

        monkeypatch.setattr("api.future_gadget_api.worldline_connection_manager", mock_manager)
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())

        from api.future_gadget_api import worldline_status_websocket_endpoint
        await worldline_status_websocket_endpoint(mock_ws)

        mock_manager.disconnect.assert_not_called()
