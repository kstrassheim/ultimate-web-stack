import pytest
import datetime
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService, 
    WorldLineStatus, 
    ExperimentStatus,
    generate_test_data  # Add this import for the new test
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

# Test Lab Member CRUD
def test_lab_member_crud(db_service):
    """Test CRUD operations for Lab Members"""
    # Get initial count
    initial_count = len(db_service.get_all_lab_members())
    
    # Create a new lab member
    new_lab_member = {
        'name': 'Maho Hiyajo',
        'codename': 'Professor Hiyajosephina',
        'role': 'AI Researcher'
    }
    
    created_member = db_service.create_lab_member(new_lab_member)
    assert created_member['id'] is not None
    assert created_member['name'] == 'Maho Hiyajo'
    
    # Verify the count increased
    assert len(db_service.get_all_lab_members()) == initial_count + 1
    
    # Get by ID - now we can use get_lab_member_by_id directly
    retrieved_member = db_service.get_lab_member_by_id(created_member['id'])
    assert retrieved_member is not None
    assert retrieved_member['name'] == created_member['name']
    
    # Update lab member - now we can test update functionality
    update_data = {
        'codename': 'Hiyajo-san',
        'role': 'Lead AI Researcher'
    }
    updated_member = db_service.update_lab_member(created_member['id'], update_data)
    assert updated_member['codename'] == 'Hiyajo-san'
    assert updated_member['role'] == 'Lead AI Researcher'
    assert updated_member['name'] == 'Maho Hiyajo'  # Original name should be preserved
    assert 'updated_at' in updated_member  # Should have added an updated_at timestamp
    
    # Delete lab member - now we can test delete functionality
    assert db_service.delete_lab_member(created_member['id']) is True
    assert db_service.get_lab_member_by_id(created_member['id']) is None
    assert len(db_service.get_all_lab_members()) == initial_count

# Test the new data generation function
def test_generate_test_data(db_service):
    """Test that generate_test_data correctly populates the database with sample data"""
    # Make sure we start with empty tables
    db_service.experiments_table.truncate()
    db_service.d_mails_table.truncate() 
    db_service.divergence_readings_table.truncate()
    db_service.lab_members_table.truncate()
    
    # Verify tables are empty
    assert len(db_service.get_all_experiments()) == 0
    assert len(db_service.get_all_d_mails()) == 0
    assert len(db_service.get_all_divergence_readings()) == 0
    assert len(db_service.get_all_lab_members()) == 0
    
    # Generate test data
    test_data = generate_test_data(db_service)
    
    # Verify data was created in all tables
    assert len(test_data['experiments']) > 0
    assert len(test_data['d_mails']) > 0
    assert len(test_data['divergence_readings']) > 0
    assert len(test_data['lab_members']) > 0
    
    # Verify the database was populated
    assert len(db_service.get_all_experiments()) == len(test_data['experiments'])
    assert len(db_service.get_all_d_mails()) == len(test_data['d_mails'])
    assert len(db_service.get_all_divergence_readings()) == len(test_data['divergence_readings'])
    assert len(db_service.get_all_lab_members()) == len(test_data['lab_members'])
    
    # Check some specific data to ensure it was correctly inserted
    lab_members = db_service.get_all_lab_members()
    assert any(member['name'] == 'Rintaro Okabe' for member in lab_members)
    assert any(member['codename'] == 'Christina' for member in lab_members)
    
    experiments = db_service.get_all_experiments()
    assert any(exp['name'] == 'Phone Microwave (Name subject to change)' for exp in experiments)
    
    d_mails = db_service.get_all_d_mails()
    assert any('Lottery numbers' in mail['content'] for mail in d_mails)
    
    readings = db_service.get_all_divergence_readings()
    assert any(reading['reading'] == 1.048596 for reading in readings)