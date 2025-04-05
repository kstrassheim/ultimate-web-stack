import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import patch, MagicMock
from types import SimpleNamespace

from api.future_gadget_api import future_gadget_api_router
from common.auth import azure_scheme
from common.role_based_access import required_roles
from common.log import logger

# Create a test app using the actual router
app = FastAPI()
app.include_router(future_gadget_api_router)
client = TestClient(app)
API_PREFIX = "/future-gadget-lab"

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
    """Test the experiment endpoints"""

    def test_get_all_experiments(self, client_with_overridden_dependencies, setup_fgl_service):
        test_client, mock_logger = client_with_overridden_dependencies
        response = test_client.get(f"{API_PREFIX}/experiments")
        assert response.status_code == 200
        # Optionally, verify that we get the dummy data
        experiments = response.json()
        assert isinstance(experiments, list)
        assert experiments[0]["id"] == "FG-01"

    def test_get_experiment_by_id(self, client_with_overridden_dependencies, setup_fgl_service):
        test_client, mock_logger = client_with_overridden_dependencies
        response = test_client.get(f"{API_PREFIX}/experiments/FG-01")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "FG-01"

    def test_create_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        test_client, mock_logger = client_with_overridden_dependencies
        new_experiment = {
            "name": "New Experiment",
            "description": "Test experiment",
            "status": "planned",
            "creator_id": "001",
            "collaborators": []
        }
        response = test_client.post(f"{API_PREFIX}/experiments", json=new_experiment)
        # Expect 201 status code for creation
        assert response.status_code == 201
        data = response.json()
        assert data["id"] == "FG-02"

    def test_update_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        test_client, mock_logger = client_with_overridden_dependencies
        update_data = {
            "name": "Updated Experiment",
            "description": "Updated description",
            "results": "Updated results"
        }
        response = test_client.put(f"{API_PREFIX}/experiments/FG-01", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Experiment"

    def test_delete_experiment(self, client_with_overridden_dependencies, setup_fgl_service):
        test_client, mock_logger = client_with_overridden_dependencies
        response = test_client.delete(f"{API_PREFIX}/experiments/FG-01")
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