import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock
import jwt
from fastapi import Request
from fastapi_azure_auth.auth import SingleTenantAzureAuthorizationCodeBearer
import importlib
import sys
from common.auth import azure_scheme
from mock.MockAzureAuthScheme import MockAzureAuthScheme

# Test the MockAzureAuthScheme class
class TestMockAzureAuthScheme:
    
    @pytest.fixture
    def mock_request(self):
        """Create a mock request with configurable headers"""
        def _make_request(auth_header=None):
            request = MagicMock(spec=Request)
            headers = {}
            if auth_header:
                headers["Authorization"] = auth_header
            request.headers = headers
            return request
        return _make_request

    @pytest.fixture
    def mock_logger(self):
        """Mock the logger to verify it's called correctly"""
        with patch('mock.MockAzureAuthScheme.logger') as mock_log:
            yield mock_log
    
    def test_init(self, mock_logger):
        """Test that the scheme initializes correctly"""
        scheme = MockAzureAuthScheme(mock_logger)  # Pass the mock_logger
        mock_logger.info.assert_called_with("Initializing MockAzureAuthScheme (with decode)")
    
    @pytest.mark.asyncio
    async def test_call_no_auth_header(self, mock_request, mock_logger):
        """Test calling the scheme with no auth header"""
        scheme = MockAzureAuthScheme(mock_logger)  # Pass the mock_logger
        request = mock_request()
        
        token = await scheme(request)
        
        # Check logger was called appropriately
        mock_logger.info.assert_any_call("MockAzureAuthScheme called - decoding token without validation")
        mock_logger.info.assert_any_call("MockAzureAuthScheme: No Bearer token found in headers")
        
        # Check token has default roles
        assert hasattr(token, "roles")
        assert token.roles == []
    
    @pytest.mark.asyncio
    async def test_call_with_valid_jwt(self, mock_request, mock_logger):
        """Test calling the scheme with a valid JWT token"""
        # Create a test JWT with roles
        payload = {
            "oid": "test-user-id",
            "name": "Test User",
            "roles": ["Admin", "User"]
        }
        token_string = jwt.encode(payload, "test-secret")
        
        scheme = MockAzureAuthScheme(mock_logger)  # Pass the mock_logger
        request = mock_request(f"Bearer {token_string}")
        
        token = await scheme(request)
        
        # Check logger was called appropriately
        mock_logger.info.assert_any_call(f"MockAzureAuthScheme: Found Bearer token of length {len(token_string)}")
        
        # Check token has expected attributes
        assert hasattr(token, "oid")
        assert token.oid == "test-user-id"
        assert hasattr(token, "name")
        assert token.name == "Test User"
        assert hasattr(token, "roles")
        assert "Admin" in token.roles
        assert "User" in token.roles
    
    @pytest.mark.asyncio
    async def test_call_with_invalid_jwt(self, mock_request, mock_logger):
        """Test calling the scheme with an invalid JWT token"""
        invalid_token = "invalid-jwt-format"
        
        scheme = MockAzureAuthScheme(mock_logger)  # Pass the mock_logger
        request = mock_request(f"Bearer {invalid_token}")
        
        token = await scheme(request)
        
        # Check logger warnings
        mock_logger.warning.assert_called_once()
        
        # Check token has default roles despite invalid JWT
        assert hasattr(token, "roles")
        assert token.roles == []

# Test the conditional logic for scheme selection
class TestAuthSchemeSelection:
    
    @patch('common.config.tfconfig')
    @patch('common.config.mock_enabled', False)
    def test_real_scheme_in_production(mock_tf_config, monkeypatch):
        """Test that real Azure scheme is used in production"""
        # Arrange: Create test config values
        mock_config = {
            "env": {"value": "prod"},
            "client_id": {"value": "test-client-id"},
            "tenant_id": {"value": "test-tenant-id"},
            "oauth2_permission_scope_uri": {"value": "test-scope-uri"},
            "oauth2_permission_scope": {"value": "test-scope"}
        }
        
        # Configure the mock tfconfig
        mock_tf_config.__getitem__.side_effect = lambda key: mock_config[key]
        
        # Patch the SingleTenantAzureAuthorizationCodeBearer constructor
        with patch('fastapi_azure_auth.auth.SingleTenantAzureAuthorizationCodeBearer') as mock_bearer:
            # Remove auth from sys.modules to force a fresh import
            if 'common.auth' in sys.modules:
                del sys.modules['common.auth']
            
            # Act: Import the module - this will execute the conditional code
            import common.auth
            importlib.reload(common.auth)
            
            # Assert: Check that the real scheme was created with the right params
            mock_bearer.assert_called_once_with(
                app_client_id="test-client-id",
                tenant_id="test-tenant-id",
                scopes={"test-scope-uri": "test-scope"},
                allow_guest_users=True
            )

    @patch('common.config.tfconfig')
    @patch('common.config.mock_enabled', True)
    def test_mock_scheme_in_dev(mock_tf_config, monkeypatch):
        """Test that mock scheme is used in dev environment"""
        # Arrange: Set up environment as dev
        mock_config = {
            "env": {"value": "dev"},
            "oauth2_permission_scope": {"value": "test-scope"}
        }
        mock_tf_config.__getitem__.side_effect = lambda key: mock_config[key]
        
        # Mock the logger
        with patch('common.log.logger') as mock_logger:
            # Remove auth from sys.modules to force a fresh import
            if 'common.auth' in sys.modules:
                del sys.modules['common.auth']
            
            # Act: Import the module - this will execute the conditional code
            import common.auth
            importlib.reload(common.auth)
            
            # Assert: Check that the logger was called
            mock_logger.info.assert_called_with("MOCK environment is enabled")
            
            # Also verify we have a MockAzureAuthScheme
            from mock.MockAzureAuthScheme import MockAzureAuthScheme
            assert isinstance(common.auth.azure_scheme, MockAzureAuthScheme)
