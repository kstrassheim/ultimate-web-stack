import pytest
import datetime
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

# Test Experiment CRUD
def test_experiment_crud(db_service):
    """Test CRUD operations for experiments"""
    # Get initial count
    initial_count = len(db_service.get_all_experiments())
    
    # Create a new experiment with world_line_change and timestamp
    new_experiment = {
        'name': 'Time Machine Prototype',
        'description': 'Early prototype of a time machine',
        'status': ExperimentStatus.IN_PROGRESS.value,
        'creator_id': '001',
        'collaborators': ['003', '004'],
        'results': 'Ongoing testing phase',
        'world_line_change': 0.156732,
        'timestamp': datetime.datetime.now().isoformat()
    }
    
    created_exp = db_service.create_experiment(new_experiment)
    assert created_exp['id'] is not None
    assert created_exp['name'] == 'Time Machine Prototype'
    assert created_exp['world_line_change'] == 0.156732
    assert 'timestamp' in created_exp
    
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
    
    # Check that experiments are ordered by timestamp (most recent first)
    timestamps = [exp['timestamp'] for exp in experiments]
    sorted_timestamps = sorted(timestamps, reverse=True)
    assert timestamps[0] == sorted_timestamps[0]
    
    # Verify 5-minute intervals between experiments
    for i in range(1, len(experiments)):
        prev_time = datetime.datetime.fromisoformat(timestamps[i-1])
        curr_time = datetime.datetime.fromisoformat(timestamps[i])
        time_diff = prev_time - curr_time
        # Should be approximately 5 minutes (allowing for millisecond differences)
        assert abs(time_diff.total_seconds() - 300) < 1  # Within 1 second of 5 minutes
    
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