import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import patch, MagicMock, AsyncMock
from types import SimpleNamespace
from fastapi import WebSocketDisconnect

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
        # Dummy experiment that already exists
        experiment_data = {
            "id": "FG-01",
            "name": "Phone Microwave",
            "description": "A microwave that sends text messages to the past",
            "status": "completed",
            "creator_id": "001",
            "collaborators": []
        }
        mock_service.get_all_experiments.return_value = [experiment_data]
        mock_service.get_experiment_by_id.return_value = experiment_data
        mock_service.create_experiment.return_value = {
            "id": "FG-02",
            "name": "New Experiment",
            "description": "Test experiment",
            "status": "planned",
            "creator_id": "001",
            "collaborators": []
        }
        mock_service.update_experiment.return_value = {
            "id": "FG-01",
            "name": "Updated Experiment",
            "description": "Updated description",
            "status": "completed",
            "creator_id": "001",
            "collaborators": []
        }
        mock_service.delete_experiment.return_value = True
        yield mock_service


class TestExperimentEndpoints:
    """Test the experiment endpoints with updated paths"""

    def test_get_all_experiments(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_all_experiments", return_value=[
            {
                "id": "EXP-001",
                "name": "Phone Microwave",
                "description": "Send messages to the past",
                "status": "in_progress",
                "creator_id": "001",
                "collaborators": ["002", "003"],
                "results": None
            }
        ]):
            test_client, _ = client_with_overridden_dependencies
            # Use the correct lab-experiments route
            response = test_client.get(f"{API_PREFIX}/lab-experiments")
            assert response.status_code == 200
            experiments = response.json()
            assert isinstance(experiments, list)
            assert experiments[0]["id"] == "EXP-001"

    def test_get_experiment_by_id(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_experiment_by_id", return_value={
            "id": "EXP-001",
            "name": "Phone Microwave",
            "description": "Send messages to the past",
            "status": "in_progress",
            "creator_id": "001",
            "collaborators": ["002", "003"],
            "results": None
        }):
            test_client, _ = client_with_overridden_dependencies
            # Updated from /experiments to /lab-experiments
            response = test_client.get(f"{API_PREFIX}/lab-experiments/EXP-001")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "EXP-001"

    def test_create_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.create_experiment", return_value={
            "id": "EXP-002",
            "name": "Time Leap Machine",
            "description": "Transfer memories to the past",
            "status": "planned",
            "creator_id": "001",
            "collaborators": ["002"],
            "results": None
        }):
            test_client, _ = client_with_overridden_dependencies
            new_experiment = {
                "name": "Time Leap Machine",
                "description": "Transfer memories to the past",
                "status": "planned",
                "creator_id": "001",
                "collaborators": ["002"],
                "results": None
            }
            # Updated from /experiments to /lab-experiments
            response = test_client.post(f"{API_PREFIX}/lab-experiments", json=new_experiment)
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == "EXP-002"

    def test_update_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.update_experiment", return_value={
            "id": "EXP-001",
            "name": "Phone Microwave (Name subject to change)",
            "description": "Send messages to the past",
            "status": "completed",
            "creator_id": "001",
            "collaborators": ["002", "003"],
            "results": "Successful test with banana"
        }):
            test_client, _ = client_with_overridden_dependencies
            update_data = {
                "name": "Phone Microwave (Name subject to change)",
                "status": "completed",
                "results": "Successful test with banana"
            }
            # Updated from /experiments to /lab-experiments
            response = test_client.put(f"{API_PREFIX}/lab-experiments/EXP-001", json=update_data)
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "Phone Microwave (Name subject to change)"
            assert data["status"] == "completed"

    def test_delete_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.delete_experiment", return_value=True):
            test_client, _ = client_with_overridden_dependencies
            # Updated from /experiments to /lab-experiments
            response = test_client.delete(f"{API_PREFIX}/lab-experiments/EXP-001")
            assert response.status_code == 200
            data = response.json()
            assert "successfully deleted" in data["message"].lower()


class TestDMailEndpoints:
    """Test the D-Mail endpoints"""

    def test_get_all_dmails(self, client_with_overridden_dependencies, setup_fgl_service):
        # Patch the fgl_service with dummy D-Mail behaviors
        with patch("api.future_gadget_api.fgl_service.get_all_d_mails", return_value=[
            {
                "id": "DM-001",
                "sender_id": "001",
                "recipient": "002",
                "content": "Test message",
                "target_timestamp": "2025-04-05T20:00:00",
                "world_line_before": 0.5,
                "world_line_after": 1.0,
                "observed_changes": "None"
            }
        ]) as mock_get_all:
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/d-mails")
            assert response.status_code == 200
            dmails = response.json()
            assert isinstance(dmails, list)
            assert dmails[0]["id"] == "DM-001"

    def test_get_d_mail_by_id(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_d_mail_by_id", return_value={
            "id": "DM-001",
            "sender_id": "001",
            "recipient": "002",
            "content": "Test message",
            "target_timestamp": "2025-04-05T20:00:00",
            "world_line_before": 0.5,
            "world_line_after": 1.0,
            "observed_changes": "None"
        }) as mock_get_by_id:
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/d-mails/DM-001")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "DM-001"

    def test_create_d_mail(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.create_d_mail", return_value={
            "id": "DM-002",
            "sender_id": "001",
            "recipient": "003",
            "content": "New D-Mail message",
            "target_timestamp": "2025-04-05T21:00:00",
            "world_line_before": 0.6,
            "world_line_after": 1.1,
            "observed_changes": "Changed"
        }) as mock_create:
            test_client, _ = client_with_overridden_dependencies
            new_d_mail = {
                "sender_id": "001",
                "recipient": "003",
                "content": "New D-Mail message",
                "target_timestamp": "2025-04-05T21:00:00",
                "world_line_before": "0.6",
                "world_line_after": "1.1",
                "observed_changes": "Changed"
            }
            response = test_client.post(f"{API_PREFIX}/d-mails", json=new_d_mail)
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == "DM-002"

    def test_update_d_mail(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.update_d_mail", return_value={
            "id": "DM-001",
            "sender_id": "001",
            "recipient": "004",
            "content": "Updated D-Mail message",
            "target_timestamp": "2025-04-05T22:00:00",
            "world_line_before": 0.7,
            "world_line_after": 1.2,
            "observed_changes": "Updated"
        }) as mock_update:
            test_client, _ = client_with_overridden_dependencies
            update_data = {
                "recipient": "004",
                "content": "Updated D-Mail message",
                "target_timestamp": "2025-04-05T22:00:00",
                "world_line_before": "0.7",
                "world_line_after": "1.2",
                "observed_changes": "Updated"
            }
            response = test_client.put(f"{API_PREFIX}/d-mails/DM-001", json=update_data)
            assert response.status_code == 200
            data = response.json()
            assert data["recipient"] == "004"
            assert data["content"] == "Updated D-Mail message"

    def test_delete_d_mail(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.delete_d_mail", return_value=True) as mock_delete:
            test_client, _ = client_with_overridden_dependencies
            response = test_client.delete(f"{API_PREFIX}/d-mails/DM-001")
            assert response.status_code == 200
            data = response.json()
            assert "successfully deleted" in data["message"].lower()


class TestDivergenceReadingEndpoints:
    """Test the divergence meter reading endpoints"""

    def test_get_all_divergence_readings(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_all_divergence_readings", return_value=[
            {
                "id": "DR-001",
                "reading": 1.0,
                "status": "steins_gate",
                "recorded_by": "001",
                "notes": "Initial reading"
            }
        ]):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/divergence-readings")
            assert response.status_code == 200
            readings = response.json()
            assert isinstance(readings, list)
            assert readings[0]["id"] == "DR-001"

    def test_get_divergence_reading_by_id(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_divergence_reading_by_id", return_value={
            "id": "DR-001",
            "reading": 1.0,
            "status": "steins_gate",
            "recorded_by": "001",
            "notes": "Initial reading"
        }):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/divergence-readings/DR-001")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "DR-001"

    def test_create_divergence_reading(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.create_divergence_reading", return_value={
            "id": "DR-002",
            "reading": 1.2,
            "status": "steins_gate",
            "recorded_by": "002",
            "notes": "New reading"
        }):
            test_client, _ = client_with_overridden_dependencies
            new_reading = {
                "reading": "1.2",  # Using string to test conversion
                "status": "steins_gate",
                "recorded_by": "002",
                "notes": "New reading"
            }
            response = test_client.post(f"{API_PREFIX}/divergence-readings", json=new_reading)
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == "DR-002"

    def test_update_divergence_reading(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.update_divergence_reading", return_value={
            "id": "DR-001",
            "reading": 1.5,
            "status": "steins_gate",
            "recorded_by": "001",
            "notes": "Updated reading"
        }):
            test_client, _ = client_with_overridden_dependencies
            update_data = {
                "reading": "1.5",
                "notes": "Updated reading"
            }
            response = test_client.put(f"{API_PREFIX}/divergence-readings/DR-001", json=update_data)
            assert response.status_code == 200
            data = response.json()
            assert data["reading"] == 1.5

    def test_delete_divergence_reading(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.delete_divergence_reading", return_value=True):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.delete(f"{API_PREFIX}/divergence-readings/DR-001")
            assert response.status_code == 200
            data = response.json()
            assert "successfully deleted" in data["message"].lower()


class TestLabMemberEndpoints:
    """Test the lab member endpoints"""

    def test_get_all_lab_members(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_all_lab_members", return_value=[
            {
                "id": "LM-001",
                "name": "Alice",
                "codename": "Wonder",
                "role": "LabMember"
            }
        ]):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/lab-members")
            assert response.status_code == 200
            members = response.json()
            assert isinstance(members, list)
            assert members[0]["id"] == "LM-001"

    def test_get_lab_member_by_id(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.get_lab_member_by_id", return_value={
            "id": "LM-001",
            "name": "Alice",
            "codename": "Wonder",
            "role": "LabMember"
        }):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.get(f"{API_PREFIX}/lab-members/LM-001")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "LM-001"

    def test_create_lab_member(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.create_lab_member", return_value={
            "id": "LM-002",
            "name": "Bob",
            "codename": "Builder",
            "role": "LabMember"
        }):
            test_client, _ = client_with_overridden_dependencies
            new_member = {
                "name": "Bob",
                "codename": "Builder",
                "role": "LabMember"
            }
            response = test_client.post(f"{API_PREFIX}/lab-members", json=new_member)
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == "LM-002"

    def test_update_lab_member(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.update_lab_member", return_value={
            "id": "LM-001",
            "name": "Alice Updated",
            "codename": "Wonderland",
            "role": "LabMember"
        }):
            test_client, _ = client_with_overridden_dependencies
            update_data = {
                "name": "Alice Updated",
                "codename": "Wonderland"
            }
            response = test_client.put(f"{API_PREFIX}/lab-members/LM-001", json=update_data)
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "Alice Updated"

    def test_delete_lab_member(self, client_with_overridden_dependencies, setup_fgl_service):
        with patch("api.future_gadget_api.fgl_service.delete_lab_member", return_value=True):
            test_client, _ = client_with_overridden_dependencies
            response = test_client.delete(f"{API_PREFIX}/lab-members/LM-001")
            assert response.status_code == 200
            data = response.json()
            assert "successfully deleted" in data["message"].lower()


class TestFGLWebSocketEndpoints:
    """Test the FGL WebSocket endpoints for real-time updates"""
    
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
        
        # Use AsyncMock instead of a regular function to track calls
        mock_auth_connect = AsyncMock()
        # Configure the mock to track arguments
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
        
        # Verify the connection was authenticated using AsyncMock's tracking
        assert mock_auth_connect.called
        assert mock_auth_connect.call_args[0][0] == mock_websocket
    
    @pytest.mark.asyncio
    async def test_experiment_websocket_disconnect_handling(self, monkeypatch, mock_websocket):
        """Test experiment WebSocket disconnect handling"""
        # Create a mock connection manager
        mock_manager = MagicMock()
        
        # Use a simple async function implementation that doesn't rely on AsyncMock()
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
        """Test broadcasting CRUD operations data through WebSockets using the new broadcast method"""
        # Create a test experiment data
        test_experiment = {
            "id": "EXP-001",
            "name": "Test Experiment",
            "status": "in_progress"
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
        
        # IMPORTANT: Bypass security by mocking the required_roles decorator
        monkeypatch.setattr("api.future_gadget_api.required_roles", lambda roles: lambda f: f)
        
        # Import the API function after patching
        from api.future_gadget_api import create_experiment
        
        # Create a mock for the experiment model and token
        mock_experiment = MagicMock()
        mock_experiment.model_dump.return_value = test_experiment
        mock_token = MagicMock()
        mock_token.roles = ["Admin"]  # Add roles to token
        
        # Patch the database service
        with patch("api.future_gadget_api.fgl_service.create_experiment", return_value=test_experiment):
            # Call the function with explicit token parameter 
            result = await create_experiment(experiment=mock_experiment, token=mock_token)
            
            # Verify result
            assert result == test_experiment
            
            # Verify broadcast was called with correct data and type
            assert len(broadcast_args) == 1
            assert broadcast_args[0][0] == test_experiment  # data
            assert broadcast_args[0][1] == "create"        # type
    
    @pytest.mark.asyncio
    async def test_d_mail_websocket_connection(self, monkeypatch, mock_websocket):
        """Test D-Mail WebSocket connection and authentication"""
        # Create a mock connection manager with proper tracking
        mock_manager = MagicMock()
        
        # Use AsyncMock instead of a regular function
        mock_auth_connect = AsyncMock()
        # Configure the mock to track arguments
        async def side_effect(websocket):
            return None
        mock_auth_connect.side_effect = side_effect
        
        # Assign the AsyncMock to the manager
        mock_manager.auth_connect = mock_auth_connect
        
        # Patch the D-Mail connection manager
        monkeypatch.setattr("api.future_gadget_api.d_mail_connection_manager", mock_manager)
        
        # Mock logger to avoid real logging
        monkeypatch.setattr("api.future_gadget_api.logger", MagicMock())
        
        # Get the WebSocket endpoint function
        from api.future_gadget_api import d_mail_websocket_endpoint
        
        # Make websocket.receive_text raise a disconnect to end the handler
        mock_websocket.receive_text = AsyncMock(side_effect=WebSocketDisconnect())
        
        # Call the WebSocket endpoint with the mock WebSocket
        try:
            await d_mail_websocket_endpoint(mock_websocket)
        except Exception as e:
            print(f"Expected exception: {e}")
        
        # Verify the connection was authenticated using AsyncMock's tracking
        assert mock_auth_connect.called
        assert mock_auth_connect.call_args[0][0] == mock_websocket
    
    @pytest.mark.asyncio
    async def test_broadcast_with_sender_role_validation(self, monkeypatch, mock_websocket):
        """Test broadcast method with sender role validation"""
        # Set up two mock websockets - one admin, one non-admin
        admin_ws = MagicMock()
        admin_ws.state = MagicMock()
        admin_ws.state.user = {"name": "Admin User", "roles": ["Admin"]}
        
        non_admin_ws = MagicMock()
        non_admin_ws.state = MagicMock()
        non_admin_ws.state.user = {"name": "Regular User", "roles": ["User"]}
        
        # Mock connection manager to track role validation and broadcasting
        mock_manager = MagicMock()
        
        # Track sender role validation calls
        validation_calls = []
        def mock_validate_sender_roles(websocket):
            validation_calls.append(websocket)
            return "Admin" in websocket.state.user.get("roles", [])
        
        # Track broadcast data
        broadcast_data = []
        async def mock_broadcast(data, type, sender_websocket=None, skip_self=True):
            # Only proceed with validation when sender is provided
            if sender_websocket and not mock_validate_sender_roles(sender_websocket):
                return
            broadcast_data.append((data, type))
        
        # Set up manager methods
        mock_manager._validate_sender_roles = mock_validate_sender_roles
        mock_manager.broadcast = mock_broadcast
        
        # Patch the experiment connection manager
        monkeypatch.setattr("api.future_gadget_api.experiment_connection_manager", mock_manager)
        
        # Create test data
        test_experiment = {"id": "EXP-001", "name": "Test Experiment"}
        
        # Set up mocks for create_experiment
        mock_experiment = MagicMock()
        mock_experiment.model_dump.return_value = test_experiment
        
        # Import the API function after patching
        from api.future_gadget_api import create_experiment
        from fastapi import HTTPException
        
        # Test with admin sender (should work)
        admin_token = MagicMock()
        admin_token.roles = ["Admin"]
        
        # UPDATED: Override required_roles decorator for admin case only
        with patch("api.future_gadget_api.required_roles", lambda roles: lambda f: f):
            with patch("api.future_gadget_api.fgl_service.create_experiment", return_value=test_experiment):
                # Pass admin token
                await create_experiment(experiment=mock_experiment, token=admin_token)
        
        # Test with non-admin sender (should fail with 403)
        non_admin_token = MagicMock()
        non_admin_token.roles = ["User"]
        
        # FIXED: Expect HTTPException with 403 status code
        with patch("api.future_gadget_api.fgl_service.create_experiment", return_value=test_experiment):
            with pytest.raises(HTTPException) as excinfo:
                await create_experiment(experiment=mock_experiment, token=non_admin_token)
            
            # Verify it failed for the expected reason
            assert excinfo.value.status_code == 403
            assert "access" in str(excinfo.value.detail).lower()
        
        # Verify only one broadcast succeeded (the admin one)
        assert len(broadcast_data) == 1
        assert broadcast_data[0][0] == test_experiment
        assert broadcast_data[0][1] == "create"