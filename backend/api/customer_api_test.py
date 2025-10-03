import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import patch
from types import SimpleNamespace
from api.customer_api import customer_api_router
from db.customer_data_service import CustomerDataService

# Create a test app
app = FastAPI()
app.include_router(customer_api_router)
client = TestClient(app)

@pytest.fixture
def mock_dependencies():
    """Mock authentication dependencies"""
    mock_token = SimpleNamespace(roles=["Admin"])
    with patch("api.customer_api.azure_scheme") as mock_scheme, \
         patch("api.customer_api.required_roles", return_value=lambda f: f), \
         patch("api.customer_api.logger") as mock_logger:
        mock_scheme.return_value = mock_token
        yield {
            "token": mock_token,
            "scheme": mock_scheme,
            "logger": mock_logger
        }

@pytest.fixture
def client_with_overridden_dependencies():
    """Override security dependency in the app for integration testing"""
    from common.auth import azure_scheme
    test_app = FastAPI()
    mock_token = SimpleNamespace(roles=["Admin"])

    async def override_security_dependency():
        return mock_token

    with patch("api.customer_api.logger") as mock_logger:
        test_app.dependency_overrides[azure_scheme] = override_security_dependency
        test_app.include_router(customer_api_router)
        test_client = TestClient(test_app)
        yield test_client, mock_logger

@pytest.fixture(autouse=True)
def setup_test_db():
    """Setup a clean test database before each test"""
    # Use memory storage for tests
    from api import customer_api
    customer_api.customer_service = CustomerDataService(use_memory_storage=True)
    yield
    # Cleanup after test
    customer_api.customer_service.customers_table.truncate()

def test_create_customer(client_with_overridden_dependencies):
    """Test creating a new customer"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    customer_data = {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890",
        "address": "123 Main St, City, Country"
    }
    
    response = test_client.post(
        "/customers",
        json=customer_data
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "John Doe"
    assert data["email"] == "john.doe@example.com"
    assert data["phone"] == "+1234567890"
    assert data["address"] == "123 Main St, City, Country"
    assert "id" in data
    assert "created_at" in data

def test_get_all_customers(client_with_overridden_dependencies):
    """Test getting all customers"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    # Create some test customers
    from api import customer_api
    customer_api.customer_service.create_customer({
        "name": "Alice Smith",
        "email": "alice@example.com",
        "phone": "+1111111111"
    })
    customer_api.customer_service.create_customer({
        "name": "Bob Johnson",
        "email": "bob@example.com",
        "phone": "+2222222222"
    })
    
    response = test_client.get("/customers")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2
    assert any(c["name"] == "Alice Smith" for c in data)
    assert any(c["name"] == "Bob Johnson" for c in data)

def test_get_customer_by_id(client_with_overridden_dependencies):
    """Test getting a customer by ID"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    # Create a test customer
    from api import customer_api
    created_customer = customer_api.customer_service.create_customer({
        "name": "Test Customer",
        "email": "test@example.com",
        "phone": "+9999999999"
    })
    
    response = test_client.get(f"/customers/{created_customer['id']}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == created_customer["id"]
    assert data["name"] == "Test Customer"
    assert data["email"] == "test@example.com"

def test_get_customer_not_found(client_with_overridden_dependencies):
    """Test getting a non-existent customer"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    response = test_client.get("/customers/CUST-nonexistent")
    
    assert response.status_code == 404

def test_update_customer(client_with_overridden_dependencies):
    """Test updating a customer"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    # Create a test customer
    from api import customer_api
    created_customer = customer_api.customer_service.create_customer({
        "name": "Original Name",
        "email": "original@example.com",
        "phone": "+1111111111"
    })
    
    update_data = {
        "name": "Updated Name",
        "phone": "+9999999999"
    }
    
    response = test_client.put(
        f"/customers/{created_customer['id']}",
        json=update_data
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["phone"] == "+9999999999"
    assert data["email"] == "original@example.com"  # Should remain unchanged
    assert "updated_at" in data

def test_update_customer_not_found(client_with_overridden_dependencies):
    """Test updating a non-existent customer"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    update_data = {
        "name": "Updated Name"
    }
    
    response = test_client.put(
        "/customers/CUST-nonexistent",
        json=update_data
    )
    
    assert response.status_code == 404

def test_delete_customer(client_with_overridden_dependencies):
    """Test deleting a customer"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    # Create a test customer
    from api import customer_api
    created_customer = customer_api.customer_service.create_customer({
        "name": "To Be Deleted",
        "email": "delete@example.com",
        "phone": "+0000000000"
    })
    
    response = test_client.delete(f"/customers/{created_customer['id']}")
    
    assert response.status_code == 204
    
    # Verify customer is deleted
    response = test_client.get(f"/customers/{created_customer['id']}")
    assert response.status_code == 404

def test_delete_customer_not_found(client_with_overridden_dependencies):
    """Test deleting a non-existent customer"""
    test_client, mock_logger = client_with_overridden_dependencies
    
    response = test_client.delete("/customers/CUST-nonexistent")
    
    assert response.status_code == 404

def test_unauthorized_access():
    """Test that non-admin users cannot access customer endpoints"""
    # Create mock token without Admin role
    mock_token = SimpleNamespace(roles=["User"])
    
    with patch("api.customer_api.azure_scheme") as mock_scheme, \
         patch("api.customer_api.required_roles") as mock_roles:
        
        # Mock the required_roles decorator to actually check roles
        def check_roles(required):
            def decorator(func):
                async def wrapper(*args, **kwargs):
                    token = kwargs.get('token', mock_token)
                    if not hasattr(token, 'roles') or not any(role in token.roles for role in required):
                        from fastapi import HTTPException
                        raise HTTPException(status_code=403, detail="Forbidden")
                    return await func(*args, **kwargs)
                return wrapper
            return decorator
        
        mock_roles.side_effect = check_roles
        mock_scheme.return_value = mock_token
        
        # Recreate the app with the new mocked dependencies
        test_app = FastAPI()
        test_app.include_router(customer_api_router)
        test_client = TestClient(test_app)
        
        # Try to get all customers
        response = test_client.get("/customers")
        
        assert response.status_code == 403
