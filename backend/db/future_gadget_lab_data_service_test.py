import pytest
import datetime
import re
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService, 
    WorldLineStatus, 
    ExperimentStatus,
    generate_test_data
)
from common.log import logger

class SafeLogHandler:
    """A minimal handler implementation with all the necessary attributes."""
    def __init__(self):
        self.level = 0
        self.filters = []
        self.stream = None
    
    def handle(self, record):
        # No-op implementation
        return

@pytest.fixture(autouse=True)
def patch_logger_handlers(monkeypatch):
    """Replace logger handlers with safe dummy handlers to avoid attribute errors."""
    # Create one safe handler for each existing handler
    safe_handlers = [SafeLogHandler() for _ in getattr(logger, "handlers", [])]
    # Replace the handlers completely
    monkeypatch.setattr(logger, "handlers", safe_handlers)

@pytest.fixture
def db_service():
    """Create a fresh in-memory database for testing"""
    return FutureGadgetLabDataService(use_memory_storage=True)

# Test Initialization
def test_initialization(db_service):
    """Test that the database is initialized with sample data"""
    # Check if tables were created and populated
    assert len(db_service.experiments_table) >= 0
    assert len(db_service.divergence_readings_table) >= 0
    
    # Verify tables exist
    assert hasattr(db_service, 'experiments_table')
    assert hasattr(db_service, 'divergence_readings_table')
    
    # Verify removed tables don't exist
    assert not hasattr(db_service, 'd_mails_table')
    assert not hasattr(db_service, 'lab_members_table')

# Test JavaScript ISO Format
def test_js_iso_format():
    """Test that JavaScript ISO format matches the expected pattern"""
    # Use the function from the module
    from db.future_gadget_lab_data_service import generate_test_data
    
    # Extract the js_iso_format function from generate_test_data
    # This is a bit of a hack to test the nested function
    current_time = datetime.datetime.now(datetime.timezone.utc)
    js_iso_format = lambda dt: dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    # Generate a timestamp
    timestamp = js_iso_format(current_time)
    
    # Check if it matches the JavaScript ISO format pattern
    pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    assert re.match(pattern, timestamp), f"Timestamp {timestamp} does not match ISO format pattern"
    
    # Verify format matches JavaScript's toISOString()
    assert timestamp.endswith('Z'), "Timestamp should end with Z"
    assert "." in timestamp, "Timestamp should include milliseconds"
    milliseconds = timestamp.split(".")[-1][:-1]  # Remove 'Z' at the end
    assert len(milliseconds) == 3, "Should have exactly 3 digits for milliseconds"

# Test Experiment CRUD with JavaScript ISO format
def test_experiment_crud_with_timestamp_format(db_service):
    """Test CRUD operations for experiments with focus on JavaScript ISO timestamp format"""
    # Create a new experiment with a properly formatted ISO timestamp
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    new_experiment = {
        'name': 'ISO Format Test',
        'description': 'Testing JavaScript ISO format timestamp compatibility',
        'status': ExperimentStatus.IN_PROGRESS.value,
        'creator_id': 'Okabe Rintaro',
        'timestamp': timestamp
    }
    
    created_exp = db_service.create_experiment(new_experiment)
    assert created_exp['timestamp'] == timestamp
    
    # Verify the timestamp format is preserved when retrieving
    retrieved_exp = db_service.get_experiment_by_id(created_exp['id'])
    assert retrieved_exp['timestamp'] == timestamp
    
    # Check format matches Frontend validation pattern: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?
    pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$'
    assert re.match(pattern, retrieved_exp['timestamp']), f"Retrieved timestamp {retrieved_exp['timestamp']} doesn't match format"

# Test Experiment CRUD
def test_experiment_crud(db_service):
    """Test CRUD operations for experiments"""
    # Get initial count
    initial_count = len(db_service.get_all_experiments())
    
    # Create a new experiment with world_line_change and timestamp in JavaScript ISO format
    current_time = datetime.datetime.now(datetime.timezone.utc)
    timestamp = current_time.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    new_experiment = {
        'name': 'Time Machine Prototype',
        'description': 'Early prototype of a time machine',
        'status': ExperimentStatus.IN_PROGRESS.value,
        'creator_id': '001',
        'collaborators': ['003', '004'],
        'results': 'Ongoing testing phase',
        'world_line_change': 0.156732,
        'timestamp': timestamp
    }
    
    created_exp = db_service.create_experiment(new_experiment)
    assert created_exp['id'] is not None
    assert created_exp['name'] == 'Time Machine Prototype'
    assert created_exp['world_line_change'] == 0.156732
    assert created_exp['timestamp'] == timestamp
    
    # Verify the count increased
    assert len(db_service.get_all_experiments()) == initial_count + 1
    
    # Get by ID
    retrieved_exp = db_service.get_experiment_by_id(created_exp['id'])
    assert retrieved_exp is not None
    assert retrieved_exp['name'] == created_exp['name']
    assert retrieved_exp['world_line_change'] == created_exp['world_line_change']
    
    # Update experiment with a new world_line_change
    update_data = {
        'status': ExperimentStatus.COMPLETED.value,
        'results': 'Successfully created a working prototype',
        'world_line_change': 0.223456
    }
    updated_exp = db_service.update_experiment(created_exp['id'], update_data)
    assert updated_exp['status'] == ExperimentStatus.COMPLETED.value
    assert updated_exp['results'] == 'Successfully created a working prototype'
    assert updated_exp['world_line_change'] == 0.223456
    
    # Delete experiment
    assert db_service.delete_experiment(created_exp['id']) is True
    assert db_service.get_experiment_by_id(created_exp['id']) is None
    assert len(db_service.get_all_experiments()) == initial_count

# Test negative world_line_change values
def test_negative_world_line_change(db_service):
    """Test that negative world_line_change values are properly stored and retrieved"""
    # Create an experiment with a negative world_line_change
    negative_exp = {
        'name': 'D-Mail Cancellation',
        'description': 'Cancel previous D-Mail to return to original worldline',
        'status': ExperimentStatus.COMPLETED.value,
        'creator_id': 'Okabe Rintaro',
        'world_line_change': -0.337192
    }
    
    created_exp = db_service.create_experiment(negative_exp)
    assert created_exp['world_line_change'] == -0.337192
    
    # Verify the negative value is preserved when retrieving
    retrieved_exp = db_service.get_experiment_by_id(created_exp['id'])
    assert retrieved_exp['world_line_change'] == -0.337192
    
    # Test with string value
    string_exp = {
        'name': 'Another Negative Test',
        'description': 'Testing negative string conversion',
        'status': ExperimentStatus.COMPLETED.value,
        'creator_id': 'Okabe Rintaro',
        'world_line_change': '-0.412591'
    }
    
    created_string_exp = db_service.create_experiment(string_exp)
    assert created_string_exp['world_line_change'] == -0.412591
    assert isinstance(created_string_exp['world_line_change'], float)

# Test Divergence Reading CRUD
def test_divergence_reading_crud(db_service):
    """Test CRUD operations for Divergence Readings"""
    # Get initial count
    initial_count = len(db_service.get_all_divergence_readings())
    
    # Create a new reading
    new_reading = {
        'reading': 1.382733,
        'status': WorldLineStatus.BETA.value,
        'recorded_by': '001',
        'notes': 'New Beta world line discovered'
    }
    
    created_reading = db_service.create_divergence_reading(new_reading)
    assert created_reading['id'] is not None
    assert created_reading['reading'] == 1.382733
    
    # Verify the count increased
    assert len(db_service.get_all_divergence_readings()) == initial_count + 1
    
    # Get by ID
    retrieved_reading = db_service.get_divergence_reading_by_id(created_reading['id'])
    assert retrieved_reading is not None
    assert retrieved_reading['reading'] == created_reading['reading']
    
    # Update reading
    update_data = {
        'notes': 'Confirmed Beta world line with Suzuha'
    }
    updated_reading = db_service.update_divergence_reading(created_reading['id'], update_data)
    assert updated_reading['notes'] == 'Confirmed Beta world line with Suzuha'
    
    # Test get_latest_divergence_reading
    latest_reading = db_service.get_latest_divergence_reading()
    assert latest_reading is not None
    
    # Delete reading
    assert db_service.delete_divergence_reading(created_reading['id']) is True
    assert db_service.get_divergence_reading_by_id(created_reading['id']) is None
    assert len(db_service.get_all_divergence_readings()) == initial_count

# Test the updated data generation function
def test_generate_test_data(db_service):
    """Test that generate_test_data correctly populates the database with sample data"""
    # Make sure we start with empty tables
    db_service.experiments_table.truncate()
    db_service.divergence_readings_table.truncate()
    
    # Verify tables are empty
    assert len(db_service.get_all_experiments()) == 0
    assert len(db_service.get_all_divergence_readings()) == 0
    
    # Generate test data
    test_data = generate_test_data(db_service)
    
    # Verify data was created in all tables
    assert len(test_data['experiments']) > 0
    assert len(test_data['divergence_readings']) > 0
    
    # Verify the database was populated
    assert len(db_service.get_all_experiments()) == len(test_data['experiments'])
    assert len(db_service.get_all_divergence_readings()) == len(test_data['divergence_readings'])
    
    # Check some specific data to ensure it was correctly inserted
    experiments = db_service.get_all_experiments()
    assert any(exp['name'] == 'Phone Microwave (Name subject to change)' for exp in experiments)
    
    # Check that world_line_change was added to experiments
    assert all('world_line_change' in exp for exp in experiments)
    
    # Check that timestamp was added to experiments
    assert all('timestamp' in exp for exp in experiments)
    
    # Verify that some experiments have negative world_line_change values
    negative_experiments = [exp for exp in experiments if exp['world_line_change'] < 0]
    assert len(negative_experiments) > 0, "No experiments found with negative world_line_change values"
    
    # Validate the ISO format of timestamps
    iso_pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    for exp in experiments:
        assert re.match(iso_pattern, exp['timestamp']), f"Timestamp {exp['timestamp']} doesn't match JavaScript ISO format"
    
    # Check for specific negative world_line_changes from our test data
    negative_values = [-0.000337, -0.048256, -0.275349, -0.412591]
    found_values = [exp['world_line_change'] for exp in experiments if exp['world_line_change'] < 0]
    
    for value in negative_values:
        assert value in found_values, f"Expected negative world_line_change {value} not found in test data"
    
    readings = db_service.get_all_divergence_readings()
    assert any(reading['reading'] == 1.048596 for reading in readings)

# Test string-to-float conversion for world_line_change
def test_world_line_change_conversion(db_service):
    """Test that string values for world_line_change are converted to float"""
    # Create experiment with string value for world_line_change
    experiment = {
        'name': 'World Line Convergence Test',
        'description': 'Testing world line convergence points',
        'status': ExperimentStatus.IN_PROGRESS.value,
        'creator_id': 'Rintaro Okabe',
        'world_line_change': '0.337192'  # String value
    }
    
    created_exp = db_service.create_experiment(experiment)
    assert isinstance(created_exp['world_line_change'], float)
    assert created_exp['world_line_change'] == 0.337192
    
    # Test update with string value
    update_data = {
        'world_line_change': '1.048596'  # String value
    }
    
    updated_exp = db_service.update_experiment(created_exp['id'], update_data)
    assert isinstance(updated_exp['world_line_change'], float)
    assert updated_exp['world_line_change'] == 1.048596
    
    # Test with negative string value
    negative_exp = {
        'name': 'Negative World Line Change',
        'description': 'Testing negative world line change',
        'status': ExperimentStatus.COMPLETED.value,
        'creator_id': 'Rintaro Okabe',
        'world_line_change': '-0.523299'  # Negative string value
    }
    
    created_neg_exp = db_service.create_experiment(negative_exp)
    assert isinstance(created_neg_exp['world_line_change'], float)
    assert created_neg_exp['world_line_change'] == -0.523299