import pytest
from unittest.mock import patch, MagicMock
import sys
import importlib

# First, we'll create a mock for the log module entirely
class MockLogger:
    def __init__(self):
        for level in ['debug', 'info', 'warning', 'error', 'critical']:
            setattr(self, level, MagicMock())
    
    def isEnabledFor(self, level):
        return True

# Create a mock for the config module
class MockConfig:
    def __init__(self):
        self.tfconfig = MockTFConfig()
        self.mock_enabled = False

class MockTFConfig:
    def __init__(self):
        self._getitem_mock = MagicMock(return_value={"value": "mock-value"})
    
    def __getitem__(self, key):
        return self._getitem_mock(key)

# Define test fixtures for consistent environment
@pytest.fixture
def setup_mocks(monkeypatch):
    """Setup mocks for the entire test session"""
    # Create our mocks
    mock_logger = MockLogger()
    mock_config = MockConfig()
    
    # Create mock modules with our mock objects
    mock_log_module = MagicMock()
    mock_log_module.logger = mock_logger
    mock_log_module.create_fixed_logger = MagicMock(return_value=mock_logger)
    mock_log_module.AzureLogHandler = MagicMock()
    
    mock_config_module = MagicMock()
    mock_config_module.tfconfig = mock_config.tfconfig
    mock_config_module.mock_enabled = mock_config.mock_enabled
    
    # Insert our mocks into sys.modules
    monkeypatch.setitem(sys.modules, 'common.log', mock_log_module)
    monkeypatch.setitem(sys.modules, 'common.config', mock_config_module)
    
    # Return the mocks so tests can configure them
    return {
        'logger': mock_logger,
        'tfconfig': mock_config.tfconfig,
        'mock_enabled': mock_config_module,
        'log_module': mock_log_module,
        'config_module': mock_config_module
    }

# Test class
class TestAuthSchemeSelection:
    
    @pytest.fixture
    def reset_auth_module(self):
        """Reset the auth module between tests"""
        if 'common.auth' in sys.modules:
            del sys.modules['common.auth']
        yield
        if 'common.auth' in sys.modules:
            del sys.modules['common.auth']
    
    def test_production_environment_uses_real_scheme(self, setup_mocks, reset_auth_module):
        """Test that production environment uses the real Azure scheme"""
        # Configure the mocks
        mock_tfconfig = setup_mocks['tfconfig']
        mock_config_module = setup_mocks['config_module']
        
        # Configure tfconfig for this test
        mock_values = {
            "env": {"value": "prod"},
            "client_id": {"value": "test-client-id"},
            "tenant_id": {"value": "test-tenant-id"},
            "oauth2_permission_scope_uri": {"value": "test-scope-uri"},
            "oauth2_permission_scope": {"value": "test-scope"}
        }
        mock_tfconfig._getitem_mock.side_effect = lambda key: mock_values.get(key, {"value": "default"})
        mock_config_module.mock_enabled = False
        
        # Mock the Azure authentication class
        with patch('fastapi_azure_auth.auth.SingleTenantAzureAuthorizationCodeBearer') as mock_azure_scheme:
            # Import the module to trigger the conditional
            import common.auth
            
            # Verify the real scheme was created with correct parameters
            mock_azure_scheme.assert_called_once_with(
                app_client_id="test-client-id",
                tenant_id="test-tenant-id",
                scopes={"test-scope-uri": "test-scope"},
                allow_guest_users=True
            )
    
    def test_dev_environment_with_mocking_enabled_uses_mock_scheme(self, setup_mocks, reset_auth_module):
        """Test that dev environment with mocking enabled uses the mock scheme"""
        
        # Configure the mocks
        mock_tfconfig = setup_mocks['tfconfig']
        mock_config_module = setup_mocks['config_module']
        mock_logger = setup_mocks['logger']
        
        # Configure tfconfig for this test
        mock_values = {
            "env": {"value": "dev"},
            "oauth2_permission_scope": {"value": "test-scope"}
        }
        mock_tfconfig._getitem_mock.side_effect = lambda key: mock_values.get(key, {"value": "default"})
        mock_config_module.mock_enabled = True
        
        # Mock the MockAzureAuthScheme class
        mock_scheme_instance = MagicMock()
        mock_scheme_class = MagicMock(return_value=mock_scheme_instance)
        
        # Apply the mocks - ensure we cleanly reload
        with patch('mock.MockAzureAuthScheme.MockAzureAuthScheme', mock_scheme_class):
            
            # Import the module to trigger the conditional - no reload
            import common.auth
            
            # Verify the mock scheme was created
            mock_scheme_class.assert_called_once_with(mock_logger)
            
            # Verify the logger was called
            mock_logger.info.assert_called_with("MOCK environment is enabled")
            
            # Verify the azure_scheme is our mock instance
            assert common.auth.azure_scheme == mock_scheme_instance
    
    def test_dev_environment_with_mocking_disabled_uses_real_scheme(self, setup_mocks, reset_auth_module):
        """Test that dev environment with mocking disabled uses the real scheme"""
        
        # Configure the mocks
        mock_tfconfig = setup_mocks['tfconfig']
        mock_config_module = setup_mocks['config_module']
        
        # Configure tfconfig for this test
        mock_values = {
            "env": {"value": "dev"},
            "client_id": {"value": "test-client-id"},
            "tenant_id": {"value": "test-tenant-id"},
            "oauth2_permission_scope_uri": {"value": "test-scope-uri"},
            "oauth2_permission_scope": {"value": "test-scope"}
        }
        mock_tfconfig._getitem_mock.side_effect = lambda key: mock_values.get(key, {"value": "default"})
        mock_config_module.mock_enabled = False
        
        # Create a mock instance
        mock_instance = MagicMock()
        mock_azure_scheme = MagicMock(return_value=mock_instance)
        
        # Apply the mocks
        with patch('fastapi_azure_auth.auth.SingleTenantAzureAuthorizationCodeBearer', mock_azure_scheme):
            
            # Import the module to trigger the conditional - no reload
            import common.auth
            
            # Verify the real scheme was created
            mock_azure_scheme.assert_called_once()
    
    def test_scopes_are_correctly_defined(self, setup_mocks, reset_auth_module):
        """Test that scopes are correctly defined from config"""
        
        # Configure the mocks
        mock_tfconfig = setup_mocks['tfconfig']
        
        # Configure tfconfig for this test
        mock_values = {
            "env": {"value": "dev"},
            "oauth2_permission_scope": {"value": "test-scope"}
        }
        mock_tfconfig._getitem_mock.side_effect = lambda key: mock_values.get(key, {"value": "default"})
        
        # Import the module to trigger the conditional
        import common.auth
        importlib.reload(common.auth)
        
        # Verify scopes are defined correctly
        assert common.auth.scopes == ["test-scope"]