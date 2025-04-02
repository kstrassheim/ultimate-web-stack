import pytest
from unittest.mock import patch, mock_open, MagicMock
import json
import sys
import os

# Store original environment to restore it later
original_environ = dict(os.environ)

@pytest.fixture
def reset_config_module():
    """Reset the config module between tests"""
    # Save original environment
    saved_environ = dict(os.environ)
    
    # Clear module from cache if needed
    if 'common.config' in sys.modules:
        del sys.modules['common.config']
    
    yield
    
    # After test, restore environment more safely
    # First update with saved values
    for key, value in saved_environ.items():
        os.environ[key] = value
    
    # Then remove any new keys that weren't in the original
    for key in list(os.environ.keys()):
        if key not in saved_environ:
            os.environ.pop(key, None)  # Use pop with default to avoid KeyError
    
    # Clear module again
    if 'common.config' in sys.modules:
        del sys.modules['common.config']

class TestConfigModule:
    
    def test_mock_enabled_true(self, reset_config_module):
        """Test mock_enabled is True when MOCK=true in environment"""
        # Set up environment
        os.environ['MOCK'] = 'true'
        
        # Mock file operations
        mock_json = {"env": {"value": "dev"}}
        with patch('builtins.open', mock_open(read_data=json.dumps(mock_json))), \
             patch('json.load', return_value=mock_json), \
             patch('os.path.dirname', return_value='/mock/path'):
            
            # Import the module to trigger the conditional logic
            import common.config
            
            # Verify mock_enabled is True
            assert common.config.mock_enabled == True
            # Verify config path includes 'mock'
            assert 'mock/' in common.config.config_path
    
    def test_mock_enabled_false(self, reset_config_module):
        """Test mock_enabled is False when MOCK is not true"""
        # Set up environment
        os.environ['MOCK'] = 'false'
        
        # Mock file operations
        mock_json = {"env": {"value": "prod"}}
        with patch('builtins.open', mock_open(read_data=json.dumps(mock_json))), \
             patch('json.load', return_value=mock_json), \
             patch('os.path.dirname', return_value='/mock/path'):
            
            # Import the module to trigger the conditional logic
            import common.config
            
            # Verify mock_enabled is False
            assert common.config.mock_enabled == False
            # Verify config path does not include 'mock'
            assert 'mock/' not in common.config.config_path
    
    def test_file_not_found_fallback(self, reset_config_module):
        """Test fallback to alternate config path when file not found"""
        # Set up environment
        os.environ['MOCK'] = 'false'
        
        # Mock file operations with FileNotFoundError on first attempt
        mock_json = {"env": {"value": "prod"}}
        mock_open_instance = mock_open(read_data=json.dumps(mock_json))
        mock_open_instance.side_effect = [FileNotFoundError, mock_open(read_data=json.dumps(mock_json)).return_value]
        
        with patch('builtins.open', mock_open_instance), \
             patch('json.load', return_value=mock_json), \
             patch('os.path.dirname', return_value='/mock/path'), \
             patch('os.path.abspath', return_value='/mock/path/common'), \
             patch('os.path.join', return_value='/mock/path/common/../terraform.config.json'):
            
            # Import the module to trigger the fallback logic
            import common.config
            
            # Verify config was loaded
            assert common.config.tfconfig == mock_json
    
    def test_origins_dev_environment(self, reset_config_module):
        """Test origins contains local URLs in dev environment"""
        # Mock file operations
        mock_json = {"env": {"value": "dev"}}
        with patch('builtins.open', mock_open(read_data=json.dumps(mock_json))), \
             patch('json.load', return_value=mock_json), \
             patch('os.path.dirname', return_value='/mock/path'):
            
            # Import the module to trigger the conditional logic
            import common.config
            
            # Verify origins contains expected local URLs
            assert "http://localhost:5173" in common.config.origins
            assert "http://localhost:5173/__cypress/" in common.config.origins
            assert "http://localhost:8000" in common.config.origins
            assert len(common.config.origins) == 3
    
    def test_origins_prod_environment(self, reset_config_module):
        """Test origins is empty in prod environment"""
        # Mock file operations
        mock_json = {"env": {"value": "prod"}}
        with patch('builtins.open', mock_open(read_data=json.dumps(mock_json))), \
             patch('json.load', return_value=mock_json), \
             patch('os.path.dirname', return_value='/mock/path'):
            
            # Import the module to trigger the conditional logic
            import common.config
            
            # Verify origins is empty
            assert common.config.origins == []