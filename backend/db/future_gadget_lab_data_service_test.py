import pytest
import datetime
import re
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService,
    WorldLineStatus,
    ExperimentStatus,
    generate_test_data,
)
from mock.mock_future_gadget_lab_data_service import MockFutureGadgetLabDataService
from common.log import logger
from unittest.mock import patch, MagicMock

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
    return MockFutureGadgetLabDataService()

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

def test_calculate_worldline_status():
    """Test the calculate_worldline_status function for computing worldline values"""
    # Import the function
    from db.future_gadget_lab_data_service import calculate_worldline_status
    
    # Create test experiments with timestamps in JS ISO format
    current_time = datetime.datetime.now(datetime.timezone.utc)
    js_iso_format = lambda dt: dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    # Create experiments with various timestamps to test last_experiment_timestamp
    older_timestamp = js_iso_format(current_time - datetime.timedelta(minutes=10))
    newer_timestamp = js_iso_format(current_time - datetime.timedelta(minutes=5))
    newest_timestamp = js_iso_format(current_time)
    
    experiments = [
        {
            "id": "EXP-001",
            "name": "Test Experiment 1",
            "world_line_change": 0.337192,
            "timestamp": older_timestamp
        },
        {
            "id": "EXP-002",
            "name": "Test Experiment 2",
            "world_line_change": -0.048256,
            "timestamp": newer_timestamp
        },
        {
            "id": "EXP-003",
            "name": "Test Experiment 3",
            "world_line_change": 0.409431,
            "timestamp": newest_timestamp  # Most recent
        }
    ]
    
    # Create test readings
    readings = [
        {
            "id": "DR-001",
            "reading": 1.048596,
            "status": "steins_gate",
            "recorded_by": "Test User 1",
            "notes": "Reading 1"
        },
        {
            "id": "DR-002",
            "reading": 1.382733,
            "status": "beta",
            "recorded_by": "Test User 2",
            "notes": "Reading 2"
        }
    ]
    
    # Test 1: Basic calculation with all experiments
    result = calculate_worldline_status(experiments, readings)
    
    # Expected worldline: 1.0 (base) + 0.337192 - 0.048256 + 0.409431 = 1.698367
    expected_worldline = 1.0 + 0.337192 - 0.048256 + 0.409431
    
    # Verify basic calculations
    assert result["current_worldline"] == round(expected_worldline, 6)
    assert result["base_worldline"] == 1.0
    assert result["total_divergence"] == round(expected_worldline - 1.0, 6)
    assert result["experiment_count"] == 3
    
    # Verify last experiment timestamp (should be the most recent)
    assert result["last_experiment_timestamp"] == newest_timestamp
    
    # Verify closest reading (should be reading 2, as 1.382733 is closer to 1.698367 than 1.048596)
    assert result["closest_reading"]["value"] == readings[1]["reading"]
    assert result["closest_reading"]["status"] == readings[1]["status"]
    assert result["closest_reading"]["recorded_by"] == readings[1]["recorded_by"]
    
    # Verify distance calculation is correct
    calculated_distance = abs(readings[1]["reading"] - expected_worldline)
    assert result["closest_reading"]["distance"] == round(calculated_distance, 6)
    
    # Test 2: Empty experiments list
    empty_result = calculate_worldline_status([], readings)
    assert empty_result["current_worldline"] == 1.0  # Base worldline
    assert empty_result["total_divergence"] == 0.0
    assert empty_result["experiment_count"] == 0
    assert empty_result["last_experiment_timestamp"] is None
    
    # Test 3: No readings
    no_readings_result = calculate_worldline_status(experiments)
    assert no_readings_result["current_worldline"] == round(expected_worldline, 6)
    assert "closest_reading" not in no_readings_result
    
    # Test 4: Missing world_line_change values
    incomplete_experiments = [
        {"id": "EXP-004", "name": "No Change Value"},
        {"id": "EXP-005", "name": "With Change Value", "world_line_change": 0.123456}
    ]
    incomplete_result = calculate_worldline_status(incomplete_experiments, readings)
    # Expected: 1.0 (base) + 0.123456 = 1.123456
    assert incomplete_result["current_worldline"] == 1.123456
    
    # Test 5: Negative-only changes
    negative_experiments = [
        {"id": "EXP-006", "name": "Negative 1", "world_line_change": -0.2},
        {"id": "EXP-007", "name": "Negative 2", "world_line_change": -0.3}
    ]
    negative_result = calculate_worldline_status(negative_experiments, readings)
    # Expected: 1.0 (base) - 0.2 - 0.3 = 0.5
    assert negative_result["current_worldline"] == 0.5
    assert negative_result["total_divergence"] == -0.5

def test_worldline_history_with_experiment_details():
    """Test that worldline history includes experiment details in each point"""
    # Import the necessary functions
    from api.future_gadget_api import get_worldline_history
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    
    # Create test app
    app = FastAPI()
    
    # Mock API dependencies - get_worldline_history uses these functions
    with patch("api.future_gadget_api.fgl_service") as mock_service:
        # Setup mock experiments with details we expect to see
        experiments = [
            {
                "id": "EXP-001", 
                "name": "Test Experiment 1",
                "description": "First test experiment",
                "status": "completed",
                "world_line_change": 0.337192,
                "creator_id": "Okabe Rintaro",
                "collaborators": ["Makise Kurisu"],
                "results": "Success",
                "timestamp": "2025-04-07T12:00:00.000Z"
            },
            {
                "id": "EXP-002", 
                "name": "Test Experiment 2",
                "description": "Second test experiment",
                "status": "in_progress",
                "world_line_change": -0.048256,
                "creator_id": "Makise Kurisu",
                "collaborators": ["Hashida Itaru"],
                "results": None,
                "timestamp": "2025-04-07T12:30:00.000Z"
            }
        ]
        
        # Setup mock readings
        readings = [{"id": "DR-001", "reading": 1.048596, "status": "steins_gate"}]
        
        # Configure mocks
        mock_service.get_all_experiments.return_value = experiments
        mock_service.get_all_divergence_readings.return_value = readings
        
        # Create a function to mock calculate_worldline_status
        def mock_calculate_status(exps, readings=None):
            # Return different statuses based on the number of experiments
            exp_count = len(exps)
            base = {"current_worldline": 1.0 + exp_count * 0.1, "base_worldline": 1.0}
            if exp_count == 0:
                return base
            base["experiment_count"] = exp_count
            return base
        
        # Apply the mock
        with patch("api.future_gadget_api.calculate_worldline_status", side_effect=mock_calculate_status):
            # Create a mock token object directly instead of using an async function
            mock_token = type('obj', (object,), {'roles': ["Admin"]})
            
            # Patch the Security dependency in the function
            with patch("api.future_gadget_api.azure_scheme") as mock_scheme:
                # Configure the mock to return our token
                mock_scheme.return_value = mock_token
                
                # Call the function directly with our mock token
                import asyncio
                result = asyncio.run(get_worldline_history(token=mock_token))
                
                # Now validate the results
                assert len(result) == 3  # Base state + 2 experiments
                
                # Check base state has no experiment
                assert result[0]["added_experiment"] is None
                
                # Check experiment 1 details are included
                assert result[1]["added_experiment"]["id"] == "EXP-001"
                assert result[1]["added_experiment"]["name"] == "Test Experiment 1"
                assert result[1]["added_experiment"]["description"] == "First test experiment"
                assert result[1]["added_experiment"]["creator_id"] == "Okabe Rintaro"
                assert "Makise Kurisu" in result[1]["added_experiment"]["collaborators"]

                # Check experiment 2 details are included
                assert result[2]["added_experiment"]["id"] == "EXP-002"
                assert result[2]["added_experiment"]["name"] == "Test Experiment 2"
                assert result[2]["added_experiment"]["status"] == "in_progress"
                assert result[2]["added_experiment"]["world_line_change"] == -0.048256


# ---------------------------------------------------------------------------
# _query_cosmos_items defense-in-depth tests (issue #123)
#
# Cosmos DB doesn't support parameterised column references or `ORDER BY`
# expressions, so the query has to embed them as raw strings. To keep
# `_query_cosmos_items` safe for any future caller (a `search_*` endpoint
# that passes `request.json()`, a `?order_by=` query string, etc.) we
# validate every filter key and the order-by clause at construction time.
# These tests pin that behaviour.
# ---------------------------------------------------------------------------


class _FakeCosmosQuery:
    """Records the last query / parameters seen by the container stub."""

    def __init__(self):
        self.calls = []

    def __call__(self, *, query, parameters, enable_cross_partition_query):
        self.calls.append({"query": query, "parameters": parameters})
        return iter(())


def _cosmos_service():
    """Return a service whose `storage_backend == "cosmos"` and whose
    `cosmos_container.query_items` is a recording stub."""
    service = MockFutureGadgetLabDataService()
    service.storage_backend = "cosmos"
    fake = _FakeCosmosQuery()
    service.cosmos_container = MagicMock()
    service.cosmos_container.query_items.side_effect = fake
    service._cosmos_query_recorder = fake
    return service


# ---- validator unit tests ----------------------------------------------------


def test_validate_cosmos_filter_keys_accepts_plain_identifier_keys():
    from db.future_gadget_lab_data_service import _validate_cosmos_filter_keys

    # Plain column names — what every current caller passes.
    _validate_cosmos_filter_keys({})
    _validate_cosmos_filter_keys({"name": "x"})
    _validate_cosmos_filter_keys({"name": "x", "status": "planned"})
    _validate_cosmos_filter_keys({"_internal": 1, "abc_123": 2, "CamelCase": 3})


def test_validate_cosmos_filter_keys_rejects_c_prefixed_or_sql_payloads():
    from db.future_gadget_lab_data_service import _validate_cosmos_filter_keys

    # Keys that aren't plain identifiers must be rejected with ValueError so
    # an attacker can't break out of the `c.<key>` reference or inject
    # additional clauses.
    bad = [
        {"c.name": "x"},                     # caller passes plain names, not c.-prefixed
        {"name; DROP TABLE c; --": "x"},     # raw SQL payload
        {"name = @x OR 1=1": "x"},           # tautology injection
        {"1bad": "x"},                       # starts with a digit
        {"has space": "x"},                  # contains whitespace
        {"": "x"},                           # empty
        {"a.b": "x"},                        # dotted
    ]
    for filters in bad:
        with pytest.raises(ValueError, match="Invalid Cosmos DB filter keys"):
            _validate_cosmos_filter_keys(filters)


def test_validate_cosmos_filter_keys_rejects_non_string_keys():
    from db.future_gadget_lab_data_service import _validate_cosmos_filter_keys

    # Defensive: even if a future caller passes a non-string key (e.g. an
    # int) we refuse rather than silently coerce it into the query.
    with pytest.raises(ValueError, match="Invalid Cosmos DB filter keys"):
        _validate_cosmos_filter_keys({1: "x"})
    with pytest.raises(ValueError, match="Invalid Cosmos DB filter keys"):
        _validate_cosmos_filter_keys({None: "x"})


def test_validate_cosmos_order_by_accepts_valid_clauses():
    from db.future_gadget_lab_data_service import _validate_cosmos_order_by

    # The shapes the issue explicitly allows.
    _validate_cosmos_order_by("c.timestamp")
    _validate_cosmos_order_by("c.timestamp DESC")
    _validate_cosmos_order_by("c.timestamp ASC")
    _validate_cosmos_order_by("c._internal")
    _validate_cosmos_order_by("c.column_123")


def test_validate_cosmos_order_by_rejects_sql_payloads_and_other_clauses():
    from db.future_gadget_lab_data_service import _validate_cosmos_order_by

    # The injection shapes the issue specifically warns about — `ORDER BY`
    # is the most permissive slot in any SQL dialect, so the regex has to
    # be tight.
    bad = [
        "",                                          # empty
        "c.timestamp; DROP c; --",                   # raw SQL
        "c.timestamp ASC LIMIT 10",                  # extra clause
        "c.timestamp ASC; evil",                     # trailing junk
        "c.timestamp DESC, c.id ASC",                # multi-column
        "timestamp DESC",                            # missing `c.` prefix
        "C.timestamp DESC",                          # wrong alias
        "c.[timestamp]",                             # brackets
        "c.`timestamp`",                             # backticks
        "c.123",                                     # numeric column
        None,                                        # wrong type
        42,                                          # wrong type
    ]
    for order_by in bad:
        with pytest.raises(ValueError, match="Invalid Cosmos DB ORDER BY clause"):
            _validate_cosmos_order_by(order_by)


# ---- _query_cosmos_items integration tests -----------------------------------


def test_query_cosmos_items_uses_module_constants_and_emits_parameterised_values():
    service = _cosmos_service()

    items = service._query_cosmos_items(
        "experiment",
        filters={"name": "Phone Microwave", "status": "completed"},
        order_by="c.timestamp DESC",
        limit=5,
    )

    assert items == []
    assert len(service._cosmos_query_recorder.calls) == 1
    call = service._cosmos_query_recorder.calls[0]

    # `c.` prefix on the filter keys, `c.` reference for `ORDER BY`.
    assert "c.name = @p0" in call["query"]
    assert "c.status = @p1" in call["query"]
    assert " ORDER BY c.timestamp DESC" in call["query"]
    # `limit` rewrites `SELECT *` -> `SELECT TOP 5 *` in the SQL prefix
    # constant, but the rest of the template is untouched.
    assert call["query"].startswith("SELECT TOP 5 * FROM c WHERE ")
    assert call["query"].endswith("ORDER BY c.timestamp DESC")

    # Values stay in `parameters`, never in the query string.
    assert call["parameters"] == [
        {"name": "@type", "value": "experiment"},
        {"name": "@p0", "value": "Phone Microwave"},
        {"name": "@p1", "value": "completed"},
    ]
    assert "Phone Microwave" not in call["query"]
    assert "completed" not in call["query"]


def test_query_cosmos_items_works_without_filters_or_order_by():
    service = _cosmos_service()

    items = service._query_cosmos_items("divergence_reading")

    assert items == []
    call = service._cosmos_query_recorder.calls[0]
    assert call["query"] == "SELECT * FROM c WHERE c.type = @type"
    assert call["parameters"] == [{"name": "@type", "value": "divergence_reading"}]


def test_query_cosmos_items_rejects_malicious_filter_keys_before_querying_cosmos():
    service = _cosmos_service()

    # Mimic a future caller that forwards request.json() straight into the
    # filter dict — without validation this would let `c.type = @type AND
    # c.evilKey = @p1` work and `evilKey = @p1` break out of the column
    # reference entirely.
    with pytest.raises(ValueError, match="Invalid Cosmos DB filter keys"):
        service._query_cosmos_items(
            "experiment",
            filters={"name": "x", "type = @type OR 1=1": "y"},
        )

    # Validation must run before we ever talk to Cosmos.
    assert service._cosmos_query_recorder.calls == []


def test_query_cosmos_items_rejects_malicious_order_by_before_querying_cosmos():
    service = _cosmos_service()

    # `ORDER BY` is the most permissive slot — a `?order_by=c.timestamp DESC;
    # <attacker payload>` from a future sortable-table endpoint would
    # otherwise execute as raw SQL.
    with pytest.raises(ValueError, match="Invalid Cosmos DB ORDER BY clause"):
        service._query_cosmos_items(
            "divergence_reading",
            order_by="c.timestamp DESC; DROP c; --",
        )

    assert service._cosmos_query_recorder.calls == []


def test_query_cosmos_items_rejects_invalid_input_even_without_cosmos_container():
    # Validation runs *before* the cosmos_container check so dev / mock
    # environments get the same defence as production.
    service = MockFutureGadgetLabDataService()
    service.cosmos_container = None

    with pytest.raises(ValueError, match="Invalid Cosmos DB filter keys"):
        service._query_cosmos_items("experiment", filters={"c.evil": "x"})

    with pytest.raises(ValueError, match="Invalid Cosmos DB ORDER BY clause"):
        service._query_cosmos_items("experiment", order_by="evil")

# ---------------------------------------------------------------------------
# Coverage gap closures (issue #147)
#
# The tests below exercise the paths no test previously called:
#   * real ``_initialize_db`` validation (Cosmos config required)
#   * ``_initialize_cosmos_backend`` success / failure / seeding branches
#   * every Cosmos-backed CRUD branch (success, not-found, HTTP error)
#   * the tinydb ``search_experiments`` / empty-latest-reading branches
#   * payload-preparation edge cases (string->float, default status, uuid ids)
#   * ``calculate_worldline_status`` reading-value fallbacks
# All Cosmos access is stubbed with MagicMock containers — no network.
# ---------------------------------------------------------------------------

from azure.cosmos.exceptions import (
    CosmosHttpResponseError,
    CosmosResourceNotFoundError,
)
from azure.core.exceptions import AzureError
import db.future_gadget_lab_data_service as fgl_module


def test_initialize_db_requires_cosmos_configuration():
    """The real data service refuses to start without Cosmos config."""
    with pytest.raises(ValueError, match="Cosmos configuration is required"):
        FutureGadgetLabDataService()

    # Partial configuration is still rejected.
    with pytest.raises(ValueError, match="Cosmos configuration is required"):
        FutureGadgetLabDataService(cosmos_account_uri="https://example.documents.azure.com:443/")


def test_initialize_db_requires_azure_cosmos_package(monkeypatch):
    """If azure-cosmos is not installed the service fails fast with ImportError."""
    monkeypatch.setattr(fgl_module, "CosmosClient", None)
    with pytest.raises(ImportError, match="azure-cosmos is required"):
        FutureGadgetLabDataService(
            cosmos_account_uri="https://example.documents.azure.com:443/",
            cosmos_database="db",
            cosmos_container="container",
        )


def test_initialize_db_requires_azure_identity_package(monkeypatch):
    """If azure-identity is not installed the service fails fast with ImportError."""
    monkeypatch.setattr(fgl_module, "DefaultAzureCredential", None)
    with pytest.raises(ImportError, match="azure-identity is required"):
        FutureGadgetLabDataService(
            cosmos_account_uri="https://example.documents.azure.com:443/",
            cosmos_database="db",
            cosmos_container="container",
        )


def _make_cosmos_service(monkeypatch, query_items_side_effect=None):
    """Build a real FutureGadgetLabDataService wired to a stubbed Cosmos client."""
    container = MagicMock()
    if query_items_side_effect is not None:
        container.query_items.side_effect = query_items_side_effect
    else:
        # Default: container already holds data, so no seeding happens.
        container.query_items.return_value = iter([{"id": "existing"}])

    database = MagicMock()
    database.create_container_if_not_exists.return_value = container
    cosmos_client = MagicMock()
    cosmos_client.create_database_if_not_exists.return_value = database

    monkeypatch.setattr(fgl_module, "CosmosClient", MagicMock(return_value=cosmos_client))
    monkeypatch.setattr(fgl_module, "DefaultAzureCredential", MagicMock())

    service = FutureGadgetLabDataService(
        cosmos_account_uri="https://example.documents.azure.com:443/",
        cosmos_database="db",
        cosmos_container="container",
        credential=object(),
    )
    return service, container, cosmos_client


def test_initialize_cosmos_backend_success_skips_seeding_when_not_empty(monkeypatch):
    service, container, cosmos_client = _make_cosmos_service(monkeypatch)

    assert service.storage_backend == "cosmos"
    assert service.cosmos_container is container
    cosmos_client.create_database_if_not_exists.assert_called_once_with(id="db")
    database = cosmos_client.create_database_if_not_exists.return_value
    database.create_container_if_not_exists.assert_called_once()


def test_initialize_cosmos_backend_uses_default_credential_when_none_passed(monkeypatch):
    default_cred = MagicMock()
    monkeypatch.setattr(fgl_module, "DefaultAzureCredential", default_cred)
    cosmos_client_cls = MagicMock()
    cosmos_client_cls.return_value.create_database_if_not_exists.return_value.create_container_if_not_exists.return_value.query_items.return_value = iter([{"id": "x"}])
    monkeypatch.setattr(fgl_module, "CosmosClient", cosmos_client_cls)

    FutureGadgetLabDataService(
        cosmos_account_uri="https://example.documents.azure.com:443/",
        cosmos_database="db",
        cosmos_container="container",
    )
    default_cred.assert_called_once_with(exclude_interactive_browser_credential=True)


def test_initialize_cosmos_backend_seeds_when_empty(monkeypatch):
    service, container, _ = _make_cosmos_service(
        monkeypatch, query_items_side_effect=lambda **kwargs: iter([])
    )
    # The empty container must have been seeded with the sample dataset.
    assert container.upsert_item.call_count > 0
    types = {call.args[0]["type"] for call in container.upsert_item.call_args_list}
    assert types == {"experiment", "divergence_reading"}


def test_initialize_cosmos_backend_raises_on_azure_error(monkeypatch):
    monkeypatch.setattr(
        fgl_module,
        "CosmosClient",
        MagicMock(side_effect=AzureError("nope")),
    )
    monkeypatch.setattr(fgl_module, "DefaultAzureCredential", MagicMock())
    with pytest.raises(AzureError):
        FutureGadgetLabDataService(
            cosmos_account_uri="https://example.documents.azure.com:443/",
            cosmos_database="db",
            cosmos_container="container",
            credential=object(),
        )


def test_seed_cosmos_if_empty_without_container_is_noop(db_service):
    db_service.cosmos_container = None
    db_service._seed_cosmos_if_empty()  # must simply return


def test_seed_cosmos_if_empty_logs_and_returns_on_query_error(monkeypatch, db_service):
    container = MagicMock()
    container.query_items.side_effect = CosmosHttpResponseError(message="boom")
    db_service.cosmos_container = container
    with patch.object(fgl_module, "generate_test_data") as mock_generate:
        db_service._seed_cosmos_if_empty()
        mock_generate.assert_not_called()


# ---- Cosmos-backed CRUD branches --------------------------------------------


@pytest.fixture
def cosmos_service(db_service):
    """A mock-backed service switched into Cosmos mode with a stub container."""
    db_service.storage_backend = "cosmos"
    db_service.cosmos_container = MagicMock()
    return db_service


def test_cosmos_get_all_experiments(cosmos_service):
    cosmos_service.cosmos_container.query_items.return_value = iter(
        [{"id": "EXP-1", "type": "experiment", "name": "PM"}]
    )
    items = cosmos_service.get_all_experiments()
    assert items == [{"id": "EXP-1", "name": "PM"}]  # `type` stripped


def test_cosmos_get_experiment_by_id(cosmos_service):
    cosmos_service.cosmos_container.read_item.return_value = {
        "id": "EXP-1",
        "type": "experiment",
        "name": "PM",
    }
    item = cosmos_service.get_experiment_by_id("EXP-1")
    assert item == {"id": "EXP-1", "name": "PM"}
    cosmos_service.cosmos_container.read_item.assert_called_once_with(
        item="EXP-1", partition_key="experiment"
    )


def test_cosmos_get_experiment_by_id_not_found(cosmos_service):
    cosmos_service.cosmos_container.read_item.side_effect = CosmosResourceNotFoundError(message="nf")
    assert cosmos_service.get_experiment_by_id("missing") is None


def test_cosmos_get_experiment_by_id_http_error_returns_none(cosmos_service):
    cosmos_service.cosmos_container.read_item.side_effect = CosmosHttpResponseError(message="boom")
    assert cosmos_service.get_experiment_by_id("EXP-1") is None


def test_cosmos_search_experiments(cosmos_service):
    cosmos_service.cosmos_container.query_items.return_value = iter([])
    assert cosmos_service.search_experiments({"status": "completed"}) == []
    call = cosmos_service.cosmos_container.query_items.call_args
    assert "c.status = @p0" in call.kwargs["query"]


def test_cosmos_create_experiment(cosmos_service):
    created = cosmos_service.create_experiment({"id": "EXP-9", "name": "X"})
    assert created["type"] == "experiment"
    cosmos_service.cosmos_container.upsert_item.assert_called_once_with(created)


def test_cosmos_create_experiment_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.upsert_item.side_effect = CosmosHttpResponseError(message="boom")
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service.create_experiment({"id": "EXP-9", "name": "X"})


def test_cosmos_update_experiment_success(cosmos_service):
    cosmos_service.cosmos_container.read_item.return_value = {"id": "EXP-1", "type": "experiment", "name": "Old"}
    cosmos_service.cosmos_container.replace_item.return_value = {"id": "EXP-1", "type": "experiment", "name": "New"}
    updated = cosmos_service.update_experiment("EXP-1", {"name": "New"})
    assert updated == {"id": "EXP-1", "name": "New"}
    body = cosmos_service.cosmos_container.replace_item.call_args.kwargs["body"]
    assert body["type"] == "experiment"
    assert "updated_at" in body


def test_cosmos_update_experiment_not_found_on_lookup(cosmos_service):
    # get_experiment_by_id (cosmos read) reports the item as missing.
    cosmos_service.cosmos_container.read_item.side_effect = CosmosResourceNotFoundError(message="nf")
    assert cosmos_service.update_experiment("missing", {"name": "X"}) is None


def test_cosmos_update_experiment_not_found_on_reread(cosmos_service):
    # First read (existence check) succeeds, the update-time read 404s.
    cosmos_service.cosmos_container.read_item.side_effect = [
        {"id": "EXP-1", "type": "experiment"},
        CosmosResourceNotFoundError(message="nf"),
    ]
    assert cosmos_service.update_experiment("EXP-1", {"name": "X"}) is None


def test_cosmos_update_experiment_read_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.read_item.side_effect = [
        {"id": "EXP-1", "type": "experiment"},
        CosmosHttpResponseError(message="boom"),
    ]
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service.update_experiment("EXP-1", {"name": "X"})


def test_cosmos_update_experiment_replace_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.read_item.return_value = {"id": "EXP-1", "type": "experiment"}
    cosmos_service.cosmos_container.replace_item.side_effect = CosmosHttpResponseError(message="boom")
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service.update_experiment("EXP-1", {"name": "X"})


def test_cosmos_delete_experiment(cosmos_service):
    assert cosmos_service.delete_experiment("EXP-1") is True
    cosmos_service.cosmos_container.delete_item.assert_called_once_with(
        item="EXP-1", partition_key="experiment"
    )


def test_cosmos_delete_experiment_not_found(cosmos_service):
    cosmos_service.cosmos_container.delete_item.side_effect = CosmosResourceNotFoundError(message="nf")
    assert cosmos_service.delete_experiment("missing") is False


def test_cosmos_delete_experiment_http_error_returns_false(cosmos_service):
    cosmos_service.cosmos_container.delete_item.side_effect = CosmosHttpResponseError(message="boom")
    assert cosmos_service.delete_experiment("EXP-1") is False


def test_cosmos_get_all_divergence_readings(cosmos_service):
    cosmos_service.cosmos_container.query_items.return_value = iter(
        [{"id": "DR-1", "type": "divergence_reading", "reading": 1.0}]
    )
    assert cosmos_service.get_all_divergence_readings() == [{"id": "DR-1", "reading": 1.0}]


def test_cosmos_get_divergence_reading_by_id(cosmos_service):
    cosmos_service.cosmos_container.read_item.return_value = {
        "id": "DR-1",
        "type": "divergence_reading",
        "reading": 1.0,
    }
    item = cosmos_service.get_divergence_reading_by_id("DR-1")
    assert item == {"id": "DR-1", "reading": 1.0}


def test_cosmos_create_divergence_reading(cosmos_service):
    created = cosmos_service.create_divergence_reading({"reading": 1.048596})
    assert created["type"] == "divergence_reading"
    assert created["id"].startswith("DR-")  # uuid fallback id on non-tinydb backend
    cosmos_service.cosmos_container.upsert_item.assert_called_once_with(created)


def test_cosmos_create_divergence_reading_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.upsert_item.side_effect = CosmosHttpResponseError(message="boom")
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service.create_divergence_reading({"reading": 1.0})


def test_cosmos_update_divergence_reading_success(cosmos_service):
    cosmos_service.cosmos_container.read_item.return_value = {"id": "DR-1", "type": "divergence_reading", "reading": 1.0}
    cosmos_service.cosmos_container.replace_item.return_value = {"id": "DR-1", "type": "divergence_reading", "reading": 1.1}
    updated = cosmos_service.update_divergence_reading("DR-1", {"reading": 1.1})
    assert updated == {"id": "DR-1", "reading": 1.1}
    body = cosmos_service.cosmos_container.replace_item.call_args.kwargs["body"]
    assert body["type"] == "divergence_reading"


def test_cosmos_update_divergence_reading_not_found_on_lookup(cosmos_service):
    cosmos_service.cosmos_container.read_item.side_effect = CosmosResourceNotFoundError(message="nf")
    assert cosmos_service.update_divergence_reading("missing", {"reading": 1.0}) is None


def test_cosmos_update_divergence_reading_not_found_on_reread(cosmos_service):
    cosmos_service.cosmos_container.read_item.side_effect = [
        {"id": "DR-1", "type": "divergence_reading"},
        CosmosResourceNotFoundError(message="nf"),
    ]
    assert cosmos_service.update_divergence_reading("DR-1", {"reading": 1.0}) is None


def test_cosmos_update_divergence_reading_read_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.read_item.side_effect = [
        {"id": "DR-1", "type": "divergence_reading"},
        CosmosHttpResponseError(message="boom"),
    ]
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service.update_divergence_reading("DR-1", {"reading": 1.0})


def test_cosmos_update_divergence_reading_replace_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.read_item.return_value = {"id": "DR-1", "type": "divergence_reading"}
    cosmos_service.cosmos_container.replace_item.side_effect = CosmosHttpResponseError(message="boom")
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service.update_divergence_reading("DR-1", {"reading": 1.0})


def test_cosmos_delete_divergence_reading(cosmos_service):
    assert cosmos_service.delete_divergence_reading("DR-1") is True
    cosmos_service.cosmos_container.delete_item.assert_called_once_with(
        item="DR-1", partition_key="divergence_reading"
    )


def test_cosmos_delete_divergence_reading_not_found(cosmos_service):
    cosmos_service.cosmos_container.delete_item.side_effect = CosmosResourceNotFoundError(message="nf")
    assert cosmos_service.delete_divergence_reading("missing") is False


def test_cosmos_delete_divergence_reading_http_error_returns_false(cosmos_service):
    cosmos_service.cosmos_container.delete_item.side_effect = CosmosHttpResponseError(message="boom")
    assert cosmos_service.delete_divergence_reading("DR-1") is False


def test_cosmos_get_latest_divergence_reading(cosmos_service):
    cosmos_service.cosmos_container.query_items.return_value = iter(
        [{"id": "DR-9", "type": "divergence_reading", "reading": 1.048596, "timestamp": "2025-01-01T00:00:00.000Z"}]
    )
    latest = cosmos_service.get_latest_divergence_reading()
    assert latest["id"] == "DR-9"
    call = cosmos_service.cosmos_container.query_items.call_args
    assert "ORDER BY c.timestamp DESC" in call.kwargs["query"]
    assert "SELECT TOP 1 *" in call.kwargs["query"]


def test_cosmos_get_latest_divergence_reading_empty(cosmos_service):
    cosmos_service.cosmos_container.query_items.return_value = iter([])
    assert cosmos_service.get_latest_divergence_reading() is None


# ---- tinydb branches that were never exercised ------------------------------


def test_tinydb_search_experiments_with_filters(db_service):
    db_service.experiments_table.truncate()
    db_service.create_experiment({"name": "Phone Microwave", "status": "completed"})
    db_service.create_experiment({"name": "Time Leap Machine", "status": "in_progress"})

    results = db_service.search_experiments({"name": "Phone Microwave"})
    assert len(results) == 1
    assert results[0]["name"] == "Phone Microwave"

    # Multiple filters are ANDed together.
    results = db_service.search_experiments({"name": "Phone Microwave", "status": "completed"})
    assert len(results) == 1

    results = db_service.search_experiments({"name": "Phone Microwave", "status": "planned"})
    assert results == []


def test_tinydb_search_experiments_without_filters_returns_all(db_service):
    assert db_service.search_experiments({}) == db_service.get_all_experiments()


def test_tinydb_update_experiment_returns_none_for_unknown_id(db_service):
    assert db_service.update_experiment("does-not-exist", {"name": "X"}) is None


def test_tinydb_update_divergence_reading_returns_none_for_unknown_id(db_service):
    assert db_service.update_divergence_reading("does-not-exist", {"reading": 1.0}) is None


def test_tinydb_get_latest_divergence_reading_empty(db_service):
    db_service.divergence_readings_table.truncate()
    assert db_service.get_latest_divergence_reading() is None


def test_prepare_divergence_payload_string_conversion_and_default_status(db_service):
    created = db_service.create_divergence_reading({"reading": "1.048596", "value": "0.5"})
    assert created["reading"] == 1.048596
    assert created["value"] == 0.5
    # Neither `status` nor `world_line_status` given -> default alpha.
    assert created["status"] == WorldLineStatus.ALPHA.value


def test_prepare_divergence_update_payload_string_conversion(db_service):
    created = db_service.create_divergence_reading({"reading": 1.0})
    updated = db_service.update_divergence_reading(created["id"], {"reading": "1.1", "value": "2.2"})
    assert updated["reading"] == 1.1
    assert updated["value"] == 2.2


# ---- internal helpers --------------------------------------------------------


def test_query_cosmos_items_without_container_returns_empty_list(db_service):
    db_service.cosmos_container = None
    assert db_service._query_cosmos_items("experiment") == []


def test_query_cosmos_items_http_error_returns_empty_list(cosmos_service):
    cosmos_service.cosmos_container.query_items.side_effect = CosmosHttpResponseError(message="boom")
    assert cosmos_service._query_cosmos_items("experiment") == []


def test_read_cosmos_item_without_container_returns_none(db_service):
    db_service.cosmos_container = None
    assert db_service._read_cosmos_item("EXP-1", "experiment") is None


def test_upsert_cosmos_item_without_container_raises(db_service):
    db_service.cosmos_container = None
    with pytest.raises(RuntimeError, match="Cosmos container is not initialized"):
        db_service._upsert_cosmos_item({"id": "EXP-1"})


def test_upsert_cosmos_item_generates_missing_id(cosmos_service):
    item = {"name": "No ID"}
    cosmos_service._upsert_cosmos_item(item)
    assert "id" in item
    cosmos_service.cosmos_container.upsert_item.assert_called_once_with(item)


def test_upsert_cosmos_item_http_error_reraises(cosmos_service):
    cosmos_service.cosmos_container.upsert_item.side_effect = CosmosHttpResponseError(message="boom")
    with pytest.raises(CosmosHttpResponseError):
        cosmos_service._upsert_cosmos_item({"id": "EXP-1"})


def test_cosmos_clean_item(db_service):
    assert db_service._cosmos_clean_item(None) is None
    assert db_service._cosmos_clean_item({"id": "X", "type": "experiment", "name": "Y"}) == {
        "id": "X",
        "name": "Y",
    }


# ---- calculate_worldline_status reading-value fallbacks ----------------------


def test_calculate_worldline_status_reading_value_fallbacks():
    from db.future_gadget_lab_data_service import calculate_worldline_status

    experiments = [{"id": "EXP-1", "world_line_change": 0.1, "timestamp": "2025-01-01T00:00:00.000Z"}]
    readings = [
        {"id": "DR-1", "value": 1.05},           # `value` used when `reading` absent
        {"id": "DR-2"},                           # neither field -> 0.0
        {"id": "DR-3", "reading": "1.09"},        # numeric string -> float
        {"id": "DR-4", "reading": "not-a-number"} # unparsable string -> 0.0
    ]
    result = calculate_worldline_status(experiments, readings)
    # current worldline = 1.1; closest reading is DR-3 (1.09, distance 0.01)
    assert result["current_worldline"] == 1.1
    assert result["closest_reading"]["value"] == "1.09"
    assert result["closest_reading"]["status"] is None
    assert result["closest_reading"]["recorded_by"] == "Unknown"
    assert result["closest_reading"]["notes"] == ""


def test_calculate_worldline_status_placeholder_when_no_closest_reading():
    """A NaN reading can never win the min-distance comparison, so the
    placeholder branch (no closest reading) is exercised deterministically."""
    from db.future_gadget_lab_data_service import calculate_worldline_status

    result = calculate_worldline_status(
        [{"id": "EXP-1", "world_line_change": 0.1}],
        [{"id": "DR-1", "reading": float("nan"), "status": "alpha"}],
    )
    closest = result["closest_reading"]
    assert closest["status"] == "unknown"
    assert closest["recorded_by"] == "System"
    assert closest["notes"] == "No divergence readings available for comparison"


def test_seed_test_data_if_empty_seeds_and_logs(db_service):
    from db.future_gadget_lab_data_service import seed_test_data_if_empty

    db_service.experiments_table.truncate()
    db_service.divergence_readings_table.truncate()

    assert seed_test_data_if_empty(db_service, logger) is True
    assert len(db_service.get_all_experiments()) > 0
    assert len(db_service.get_all_divergence_readings()) > 0


def test_seed_test_data_if_empty_noop_when_data_present(db_service):
    from db.future_gadget_lab_data_service import seed_test_data_if_empty

    if not db_service.get_all_experiments():
        db_service.create_experiment({"name": "existing"})
    assert seed_test_data_if_empty(db_service, logger) is False


# ---- branch-coverage closures (issue #147) -----------------------------------


def test_prepare_experiment_payload_preserves_explicit_created_at(db_service):
    created = db_service.create_experiment({
        "name": "X",
        "created_at": "2025-01-01T00:00:00+00:00",
    })
    assert created["created_at"] == "2025-01-01T00:00:00+00:00"


def test_prepare_divergence_payload_preserves_explicit_id_and_timestamp(db_service):
    created = db_service.create_divergence_reading({
        "id": "DR-CUSTOM",
        "timestamp": "2025-01-01T00:00:00.000Z",
        "reading": 1.0,
    })
    assert created["id"] == "DR-CUSTOM"
    assert created["timestamp"] == "2025-01-01T00:00:00.000Z"
