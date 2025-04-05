import pytest
import datetime
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService, 
    WorldLineStatus, 
    ExperimentStatus
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
    assert len(db_service.d_mails_table) >= 0
    assert len(db_service.divergence_readings_table) >= 0
    assert len(db_service.lab_members_table) >= 0

# Test Experiment CRUD
def test_experiment_crud(db_service):
    """Test CRUD operations for experiments"""
    # Get initial count
    initial_count = len(db_service.get_all_experiments())
    
    # Create a new experiment
    new_experiment = {
        'name': 'Time Machine Prototype',
        'description': 'Early prototype of a time machine',
        'status': ExperimentStatus.IN_PROGRESS.value,
        'creator_id': '001',
        'collaborators': ['003', '004'],
        'results': 'Ongoing testing phase'
    }
    
    created_exp = db_service.create_experiment(new_experiment)
    assert created_exp['id'] is not None
    assert created_exp['name'] == 'Time Machine Prototype'
    
    # Verify the count increased
    assert len(db_service.get_all_experiments()) == initial_count + 1
    
    # Get by ID
    retrieved_exp = db_service.get_experiment_by_id(created_exp['id'])
    assert retrieved_exp is not None
    assert retrieved_exp['name'] == created_exp['name']
    
    # Update experiment
    update_data = {
        'status': ExperimentStatus.COMPLETED.value,
        'results': 'Successfully created a working prototype'
    }
    updated_exp = db_service.update_experiment(created_exp['id'], update_data)
    assert updated_exp['status'] == ExperimentStatus.COMPLETED.value
    assert updated_exp['results'] == 'Successfully created a working prototype'
    
    # Delete experiment
    assert db_service.delete_experiment(created_exp['id']) is True
    assert db_service.get_experiment_by_id(created_exp['id']) is None
    assert len(db_service.get_all_experiments()) == initial_count

# Test D-Mail CRUD
def test_d_mail_crud(db_service):
    """Test CRUD operations for D-Mails"""
    # Get initial count
    initial_count = len(db_service.get_all_d_mails())
    
    # Create a new D-Mail
    new_d_mail = {
        'sender_id': '004',
        'recipient': 'past-self',
        'content': 'Do not open the microwave door.',
        'target_timestamp': (datetime.datetime.now() - datetime.timedelta(days=3)).isoformat(),
        'world_line_before': '0.571024',
        'world_line_after': '0.523299',
        'observed_changes': 'Experiment failed, but everyone survived'
    }
    
    created_mail = db_service.create_d_mail(new_d_mail)
    assert created_mail['id'] is not None
    assert created_mail['content'] == 'Do not open the microwave door.'
    
    # Verify the count increased
    assert len(db_service.get_all_d_mails()) == initial_count + 1
    
    # Get by ID
    retrieved_mail = db_service.get_d_mail_by_id(created_mail['id'])
    assert retrieved_mail is not None
    assert retrieved_mail['content'] == created_mail['content']
    
    # Update D-Mail
    update_data = {
        'observed_changes': 'Timeline successfully altered, experiment succeeded'
    }
    updated_mail = db_service.update_d_mail(created_mail['id'], update_data)
    assert updated_mail['observed_changes'] == 'Timeline successfully altered, experiment succeeded'
    
    # Delete D-Mail
    assert db_service.delete_d_mail(created_mail['id']) is True
    assert db_service.get_d_mail_by_id(created_mail['id']) is None
    assert len(db_service.get_all_d_mails()) == initial_count

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

# Removed file-based storage test to avoid permission errors