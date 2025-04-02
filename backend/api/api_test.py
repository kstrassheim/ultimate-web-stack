import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from fastapi import FastAPI, Depends
from unittest.mock import patch, MagicMock
from api.api import api_router, get_user_data, get_admin_data
from common.auth import azure_scheme
from common.role_based_access import required_roles
from common.log import logger
from types import SimpleNamespace

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