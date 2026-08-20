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


# --- verify_token tests (issue #96) ---------------------------------------
# verify_token was untested in the pre-migration code base (the python-jose
# implementation had ~28% line coverage). After the migration to PyJWT, these
# tests cover both the mock path (active under MOCK=true) and the real path
# with a stubbed PyJWKClient.

def _build_test_jwt(payload):
    """Helper: build a JWT with the given payload, signed with HS256 + a
    fixed secret. The signature doesn't matter here because the mock path
    only base64-decodes the payload, and the real-path tests stub jwt.decode
    so they never actually verify the signature."""
    import jwt as _jwt
    # 32-byte secret to avoid PyJWT's InsecureKeyLengthWarning (RFC 7518 §3.2).
    return _jwt.encode(payload, "test-secret-must-be-32-bytes-long!", algorithm="HS256")


@pytest.fixture
def reset_auth_module_no_reload():
    """Reset the auth module without reload, so we can patch its tfconfig mock."""
    if 'common.auth' in sys.modules:
        del sys.modules['common.auth']
    yield
    if 'common.auth' in sys.modules:
        del sys.modules['common.auth']


@pytest.fixture
def mock_path_config(setup_mocks, reset_auth_module_no_reload):
    """Configure common.auth for the dev/mock path and import it."""
    mock_tfconfig = setup_mocks['tfconfig']
    mock_config_module = setup_mocks['config_module']
    mock_values = {
        "env": {"value": "dev"},
        "oauth2_permission_scope": {"value": "test-scope"},
        "client_id": {"value": "test-client-id"},
        "tenant_id": {"value": "test-tenant-id"},
    }
    mock_tfconfig._getitem_mock.side_effect = lambda key: mock_values.get(key, {"value": "default"})
    mock_config_module.mock_enabled = True
    with patch('mock.MockAzureAuthScheme.MockAzureAuthScheme'):
        import common.auth
    return common.auth


@pytest.fixture
def real_path_config(setup_mocks, reset_auth_module_no_reload):
    """Configure common.auth for the production (non-mock) path and import it."""
    mock_tfconfig = setup_mocks['tfconfig']
    mock_config_module = setup_mocks['config_module']
    mock_values = {
        "env": {"value": "prod"},
        "oauth2_permission_scope": {"value": "test-scope"},
        "client_id": {"value": "test-client-id"},
        "tenant_id": {"value": "test-tenant-id"},
        "oauth2_permission_scope_uri": {"value": "test-scope-uri"},
    }
    mock_tfconfig._getitem_mock.side_effect = lambda key: mock_values.get(key, {"value": "default"})
    mock_config_module.mock_enabled = False
    with patch('fastapi_azure_auth.auth.SingleTenantAzureAuthorizationCodeBearer'):
        import common.auth
    return common.auth


class TestVerifyTokenMockPath:
    """Tests for verify_token under MOCK=true (active in CI)."""

    def test_valid_jwt_with_all_claims_returns_claims(self, mock_path_config):
        token = _build_test_jwt({
            "sub": "user-1",
            "name": "Alice",
            "roles": ["Admin"],
        })
        claims = mock_path_config.verify_token(token)
        assert claims["sub"] == "user-1"
        assert claims["name"] == "Alice"
        assert claims["roles"] == ["Admin"]

    def test_valid_jwt_missing_sub_is_backfilled(self, mock_path_config):
        token = _build_test_jwt({"name": "Bob", "roles": ["User"]})
        claims = mock_path_config.verify_token(token)
        assert claims["sub"] == "mock-subject-id"
        assert claims["name"] == "Bob"
        assert claims["roles"] == ["User"]

    def test_valid_jwt_missing_name_is_backfilled(self, mock_path_config):
        token = _build_test_jwt({"sub": "u", "roles": ["User"]})
        claims = mock_path_config.verify_token(token)
        assert claims["name"] == "Mock User"

    def test_valid_jwt_missing_roles_is_backfilled(self, mock_path_config):
        token = _build_test_jwt({"sub": "u", "name": "Bob"})
        claims = mock_path_config.verify_token(token)
        assert claims["roles"] == ["User"]

    def test_invalid_jwt_falls_back_to_default_claims(self, mock_path_config):
        # Not a JWT (no dots) -> falls through to the mock_claims branch
        claims = mock_path_config.verify_token("not-a-jwt")
        assert claims["sub"] == "mock-subject-id"
        assert claims["mock_generated"] is True

    def test_role_check_any_passes(self, mock_path_config):
        token = _build_test_jwt({"sub": "u", "name": "Alice", "roles": ["User"]})
        claims = mock_path_config.verify_token(token, required_roles=["Admin", "User"])
        assert claims is not None

    def test_role_check_any_fails_raises_403(self, mock_path_config):
        from fastapi import HTTPException
        token = _build_test_jwt({"sub": "u", "name": "Alice", "roles": ["User"]})
        with pytest.raises(HTTPException) as excinfo:
            mock_path_config.verify_token(token, required_roles=["Admin"])
        assert excinfo.value.status_code == 403

    def test_role_check_all_passes(self, mock_path_config):
        token = _build_test_jwt({"sub": "u", "name": "Alice", "roles": ["Admin", "User"]})
        claims = mock_path_config.verify_token(token, required_roles=["Admin", "User"], check_all=True)
        assert claims is not None

    def test_role_check_all_fails_when_missing_one(self, mock_path_config):
        from fastapi import HTTPException
        token = _build_test_jwt({"sub": "u", "name": "Alice", "roles": ["Admin"]})
        with pytest.raises(HTTPException) as excinfo:
            mock_path_config.verify_token(token, required_roles=["Admin", "User"], check_all=True)
        assert excinfo.value.status_code == 403

    def test_role_check_is_case_insensitive(self, mock_path_config):
        token = _build_test_jwt({"sub": "u", "name": "Alice", "roles": ["ADMIN"]})
        claims = mock_path_config.verify_token(token, required_roles=["admin"])
        assert claims is not None


class TestVerifyTokenRealPath:
    """Tests for verify_token in production (PyJWT + JWKS) mode.
    The PyJWKClient and jwt.decode calls are stubbed so no network
    or cryptography key material is required."""

    def _stub_jwks(self, monkeypatch, *, decode_raises=None, decode_returns=None,
                   key_error=None):
        """Patch jwt.PyJWKClient + jwt.decode inside common.auth."""
        mock_signing_key = MagicMock()
        mock_signing_key.key = b"fake-public-key-bytes"

        mock_client = MagicMock()
        if key_error is not None:
            mock_client.get_signing_key_from_jwt.side_effect = key_error
        else:
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

        monkeypatch.setattr("common.auth.jwt.PyJWKClient", MagicMock(return_value=mock_client))

        decode_mock = MagicMock(side_effect=decode_raises if decode_raises is not None
                                else [decode_returns])
        monkeypatch.setattr("common.auth.jwt.decode", decode_mock)
        return decode_mock, mock_client

    def test_valid_token_returns_claims(self, real_path_config, monkeypatch):
        from jwt import InvalidTokenError
        decode_mock, client_mock = self._stub_jwks(
            monkeypatch,
            decode_returns={"sub": "u", "aud": "test-client-id"},
        )
        token = _build_test_jwt({"sub": "u"})
        claims = real_path_config.verify_token(token)
        assert claims["sub"] == "u"
        # Signing key lookup must have used the token (kid resolution)
        client_mock.get_signing_key_from_jwt.assert_called_once_with(token)
        # jwt.decode was called with the key bytes, RS256, and audience
        decode_mock.assert_called_once()
        kwargs = decode_mock.call_args.kwargs
        assert kwargs["algorithms"] == ["RS256"]
        assert kwargs["audience"] == "test-client-id"

    def test_kid_lookup_failure_raises_401(self, real_path_config, monkeypatch):
        from fastapi import HTTPException
        import jwt as _jwt
        key_error = _jwt.exceptions.PyJWKClientError("no such kid")
        self._stub_jwks(monkeypatch, key_error=key_error)
        with pytest.raises(HTTPException) as excinfo:
            real_path_config.verify_token("any.token.value")
        assert excinfo.value.status_code == 401
        assert "Unable to find appropriate key" in excinfo.value.detail

    def test_decode_invalid_token_raises_401(self, real_path_config, monkeypatch):
        from fastapi import HTTPException
        from jwt import InvalidTokenError
        self._stub_jwks(monkeypatch, decode_raises=InvalidTokenError("expired"))
        with pytest.raises(HTTPException) as excinfo:
            real_path_config.verify_token("any.token.value")
        assert excinfo.value.status_code == 401
        assert "Invalid authentication credentials" in excinfo.value.detail

    def test_decode_other_error_raises_401(self, real_path_config, monkeypatch):
        """Non-JWT exceptions (e.g. network errors) bubble up as 401 too."""
        from fastapi import HTTPException
        self._stub_jwks(monkeypatch, decode_raises=RuntimeError("boom"))
        with pytest.raises(HTTPException) as excinfo:
            real_path_config.verify_token("any.token.value")
        assert excinfo.value.status_code == 401