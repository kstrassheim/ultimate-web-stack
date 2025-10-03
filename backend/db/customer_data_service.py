from tinydb import TinyDB, Query
from tinydb.storages import MemoryStorage, JSONStorage
from pathlib import Path
import os
import datetime
import uuid
from typing import Dict, List, Optional
from common.log import logger

class CustomerDataService:
    """Service for storing and retrieving customer data"""
    
    def __init__(self, use_memory_storage=False, db_path=None):
        """Initialize the database
        
        Args:
            use_memory_storage: If True, use memory storage (data will be lost when app restarts)
            db_path: Path to the JSON database file (only used if use_memory_storage is False)
        """
        self.use_memory_storage = use_memory_storage
        self.db_path = db_path or Path("./data/customer_data.json")
        self._initialize_db()
    
    def _initialize_db(self):
        """Initialize the database with the appropriate storage option"""
        if self.use_memory_storage:
            logger.info("Using in-memory storage for customer data")
            self.db = TinyDB(storage=MemoryStorage)
        else:
            logger.info(f"Using file storage for customer data at {self.db_path}")
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            self.db = TinyDB(self.db_path)
        
        # Create customers table
        self.customers_table = self.db.table('customers')
    
    # ----- CUSTOMER CRUD OPERATIONS -----
    
    def get_all_customers(self) -> List[Dict]:
        """Get all customers"""
        return self.customers_table.all()
    
    def get_customer_by_id(self, customer_id: str) -> Optional[Dict]:
        """Get customer by ID"""
        Customer = Query()
        results = self.customers_table.search(Customer.id == customer_id)
        return results[0] if results else None
    
    def search_customers(self, query_params: Dict) -> List[Dict]:
        """Search customers based on query parameters"""
        Customer = Query()
        query = None
        
        # Build query based on provided parameters
        for key, value in query_params.items():
            condition = getattr(Customer, key) == value
            query = condition if query is None else (query & condition)
        
        # If no query parameters were valid, return all customers
        if query is None:
            return self.get_all_customers()
        
        return self.customers_table.search(query)
    
    def create_customer(self, customer_data: Dict) -> Dict:
        """Create a new customer"""
        if 'id' not in customer_data:
            # Generate ID if not provided
            customer_data['id'] = f"CUST-{uuid.uuid4()}"
        
        # Set creation timestamp if not provided
        if 'created_at' not in customer_data:
            customer_data['created_at'] = datetime.datetime.now().isoformat()
        
        # Insert the customer
        self.customers_table.insert(customer_data)
        return customer_data
    
    def update_customer(self, customer_id: str, customer_data: Dict) -> Optional[Dict]:
        """Update an existing customer"""
        # Get the customer
        existing_customer = self.get_customer_by_id(customer_id)
        if not existing_customer:
            return None
        
        # Update the customer
        Customer = Query()
        # Remove the ID from update data if present
        if 'id' in customer_data:
            del customer_data['id']
        
        # Add updated_at timestamp
        customer_data['updated_at'] = datetime.datetime.now().isoformat()
        
        # Update the customer
        self.customers_table.update(customer_data, Customer.id == customer_id)
        
        # Return the updated customer
        return self.get_customer_by_id(customer_id)
    
    def delete_customer(self, customer_id: str) -> bool:
        """Delete a customer"""
        Customer = Query()
        removed = self.customers_table.remove(Customer.id == customer_id)
        return len(removed) > 0

# Create a default instance for quick testing
default_customer_db = CustomerDataService(use_memory_storage=True)

# Example usage
if __name__ == "__main__":
    # Create a new customer
    new_customer = default_customer_db.create_customer({
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890",
        "address": "123 Main St, City, Country"
    })
    
    print(f"Created customer: {new_customer}")
    
    # Get all customers
    all_customers = default_customer_db.get_all_customers()
    print(f"Total customers: {len(all_customers)}")
