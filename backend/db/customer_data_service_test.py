import pytest
from db.customer_data_service import CustomerDataService

@pytest.fixture
def db_service():
    """Create a test database service instance"""
    return CustomerDataService(use_memory_storage=True)

def test_initialization(db_service):
    """Test that the database is initialized correctly"""
    # Check if table was created
    assert len(db_service.customers_table) >= 0
    
    # Verify table exists
    assert hasattr(db_service, 'customers_table')

def test_customer_crud(db_service):
    """Test CRUD operations for customers"""
    # Get initial count
    initial_count = len(db_service.get_all_customers())
    
    # Create a new customer
    new_customer = {
        'name': 'John Doe',
        'email': 'john.doe@example.com',
        'phone': '+1234567890',
        'address': '123 Main St, City, Country'
    }
    
    created_customer = db_service.create_customer(new_customer)
    assert created_customer['id'] is not None
    assert created_customer['name'] == 'John Doe'
    assert created_customer['email'] == 'john.doe@example.com'
    assert created_customer['phone'] == '+1234567890'
    assert created_customer['address'] == '123 Main St, City, Country'
    assert 'created_at' in created_customer
    
    # Verify customer count increased
    assert len(db_service.get_all_customers()) == initial_count + 1
    
    # Get customer by ID
    fetched_customer = db_service.get_customer_by_id(created_customer['id'])
    assert fetched_customer is not None
    assert fetched_customer['name'] == 'John Doe'
    
    # Update customer
    updated_data = {
        'name': 'Jane Doe',
        'phone': '+9876543210'
    }
    updated_customer = db_service.update_customer(created_customer['id'], updated_data)
    assert updated_customer['name'] == 'Jane Doe'
    assert updated_customer['phone'] == '+9876543210'
    assert updated_customer['email'] == 'john.doe@example.com'  # Should remain unchanged
    assert 'updated_at' in updated_customer
    
    # Delete customer
    assert db_service.delete_customer(created_customer['id']) is True
    assert db_service.get_customer_by_id(created_customer['id']) is None
    assert len(db_service.get_all_customers()) == initial_count

def test_customer_search(db_service):
    """Test search functionality"""
    # Create test customers
    customer1 = db_service.create_customer({
        'name': 'Alice Smith',
        'email': 'alice@example.com',
        'phone': '+1111111111'
    })
    
    customer2 = db_service.create_customer({
        'name': 'Bob Johnson',
        'email': 'bob@example.com',
        'phone': '+2222222222'
    })
    
    # Search by name
    results = db_service.search_customers({'name': 'Alice Smith'})
    assert len(results) == 1
    assert results[0]['name'] == 'Alice Smith'
    
    # Search by email
    results = db_service.search_customers({'email': 'bob@example.com'})
    assert len(results) == 1
    assert results[0]['name'] == 'Bob Johnson'

def test_customer_not_found(db_service):
    """Test operations on non-existent customer"""
    # Get non-existent customer
    assert db_service.get_customer_by_id('CUST-nonexistent') is None
    
    # Update non-existent customer
    assert db_service.update_customer('CUST-nonexistent', {'name': 'Test'}) is None
    
    # Delete non-existent customer
    assert db_service.delete_customer('CUST-nonexistent') is False
