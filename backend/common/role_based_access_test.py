import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
import asyncio

# Import the decorator we want to test
from common.role_based_access import required_roles

# Mock token class for testing
class MockToken:
    def __init__(self, roles=None):
        self.roles = roles

# Rename these to NOT start with "test_" so pytest doesn't try to run them directly
async def sample_func(token=None):
    return "Function executed successfully"

async def sample_func_with_params(param1, param2, token=None):
    return f"Function executed with {param1} and {param2}"

class TestRoleBasedAccess:
    
    @pytest.fixture
    def mock_logger(self):
        """Fixture to mock the logger in the role_based_access module"""
        with patch('common.role_based_access.logger') as mock_log:
            yield mock_log
    
    @pytest.mark.asyncio
    async def test_missing_token(self, mock_logger):
        """Test when token is completely missing"""
        # Decorate our test function
        decorated_func = required_roles(["admin"])(sample_func)  # Updated function name
        
        # Call without a token
        with pytest.raises(HTTPException) as excinfo:
            await decorated_func()
        
        # Verify the exception
        assert excinfo.value.status_code == 401
        assert "Token is missing or invalid" in excinfo.value.detail
        mock_logger.error.assert_called_once()
    
    @pytest.mark.asyncio  
    async def test_token_without_roles(self, mock_logger):
        """Test when token exists but has no roles attribute"""
        # Create a token without roles
        token = MagicMock()
        delattr(token, 'roles')
        
        # Decorate our test function
        decorated_func = required_roles(["admin"])(sample_func)  # Updated
        
        # Call with token missing roles
        with pytest.raises(HTTPException) as excinfo:
            await decorated_func(token=token)
        
        # Verify the exception
        assert excinfo.value.status_code == 403
        assert "Roles are missing in the token" in excinfo.value.detail
        mock_logger.error.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_user_without_required_roles(self, mock_logger):
        """Test when user has roles but none of the required ones"""
        # Create a token with non-matching roles
        token = MockToken(roles=["user", "guest"])
        
        # Decorate our test function
        decorated_func = required_roles(["admin", "superuser"])(sample_func)
        
        # Call with token lacking required roles
        with pytest.raises(HTTPException) as excinfo:
            await decorated_func(token=token)
        
        # Verify the exception
        assert excinfo.value.status_code == 403
        assert "You do not have access to this resource" in excinfo.value.detail
        mock_logger.error.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_user_with_some_roles_check_all_true(self, mock_logger):
        """Test when user has some but not all required roles with check_all=True"""
        # Create a token with only some of the required roles
        token = MockToken(roles=["admin", "user"])
        
        # Decorate our test function with check_all=True
        decorated_func = required_roles(["admin", "superuser"], check_all=True)(sample_func)
        
        # Call with token having some but not all required roles
        with pytest.raises(HTTPException) as excinfo:
            await decorated_func(token=token)
        
        # Verify the exception
        assert excinfo.value.status_code == 403
        assert "You do not have access to this resource" in excinfo.value.detail
        mock_logger.error.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_user_with_one_required_role(self, mock_logger):
        """Test when user has at least one of the required roles"""
        # Create a token with one matching role
        token = MockToken(roles=["user", "admin"])
        
        # Decorate our test function with default check_all=False
        decorated_func = required_roles(["admin", "superuser"])(sample_func)
        
        # Call with token having one required role
        result = await decorated_func(token=token)
        
        # Verify successful execution
        assert result == "Function executed successfully"
        mock_logger.info.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_user_with_all_required_roles(self, mock_logger):
        """Test when user has all required roles with check_all=True"""
        # Create a token with all required roles
        token = MockToken(roles=["admin", "superuser"])
        
        # Decorate our test function with check_all=True
        decorated_func = required_roles(["admin", "superuser"], check_all=True)(sample_func)
        
        # Call with token having all required roles
        result = await decorated_func(token=token)
        
        # Verify successful execution
        assert result == "Function executed successfully"
        mock_logger.info.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_case_insensitive_role_matching(self, mock_logger):
        """Test that role matching is case-insensitive"""
        # Create a token with uppercase roles
        token = MockToken(roles=["ADMIN", "USER"])
        
        # Decorate our test function with lowercase roles
        decorated_func = required_roles(["admin"])(sample_func)
        
        # Call with token having case-different role names
        result = await decorated_func(token=token)
        
        # Verify successful execution
        assert result == "Function executed successfully"
        mock_logger.info.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_function_with_params(self, mock_logger):
        """Test that the decorator works with functions that have parameters"""
        # Create a token with required role
        token = MockToken(roles=["admin"])
        
        # Decorate our test function with parameters
        decorated_func = required_roles(["admin"])(sample_func_with_params)
        
        # Call with parameters and token
        result = await decorated_func("value1", "value2", token=token)
        
        # Verify successful execution with parameters
        assert result == "Function executed with value1 and value2"
        mock_logger.info.assert_called_once()

    def test_signature_preservation(self):
        """Test that the decorator preserves function signature"""
        # Decorate our test function
        decorated_func = required_roles(["admin"])(sample_func_with_params)
        
        # Get the signature
        import inspect
        sig = inspect.signature(decorated_func)
        
        # Verify the signature was preserved
        assert 'param1' in sig.parameters
        assert 'param2' in sig.parameters
        assert 'token' in sig.parameters