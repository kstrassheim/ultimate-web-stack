from fastapi import APIRouter, Security, HTTPException, Path, Query
from pydantic import BaseModel, field_validator
from typing import List, Dict, Optional
from common.auth import azure_scheme, scopes
from common.log import logger
from common.role_based_access import required_roles
from db.customer_data_service import CustomerDataService

# Initialize the customer service
customer_service = CustomerDataService(use_memory_storage=False)

# Create API router
customer_api_router = APIRouter()

# --- Pydantic Models for Request/Response Validation ---

class CustomerBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

# --- API Routes ---

@customer_api_router.get("/customers", response_model=List[Dict])
@required_roles(["Admin"])
async def get_all_customers(
    name: Optional[str] = Query(None, description="Filter by customer name"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info("Customer API - Fetching all customers")
    
    # If name filter is provided, search by name
    if name:
        customers = customer_service.search_customers({"name": name})
    else:
        customers = customer_service.get_all_customers()
    
    logger.info(f"Customer API - Found {len(customers)} customers")
    return customers

@customer_api_router.get("/customers/{customer_id}", response_model=Dict)
@required_roles(["Admin"])
async def get_customer_by_id(
    customer_id: str = Path(..., description="The ID of the customer to retrieve"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Customer API - Fetching customer with ID: {customer_id}")
    
    customer = customer_service.get_customer_by_id(customer_id)
    
    if not customer:
        logger.warning(f"Customer API - Customer not found: {customer_id}")
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return customer

@customer_api_router.post("/customers", response_model=Dict, status_code=201)
@required_roles(["Admin"])
async def create_customer(
    customer: CustomerCreate,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Customer API - Creating new customer: {customer.name}")
    
    # Create the customer in database
    created_customer = customer_service.create_customer(customer.model_dump())
    
    return created_customer

@customer_api_router.put("/customers/{customer_id}", response_model=Dict)
@required_roles(["Admin"])
async def update_customer(
    customer_id: str = Path(..., description="The ID of the customer to update"),
    customer_update: CustomerUpdate = ...,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Customer API - Updating customer: {customer_id}")
    
    # Update the customer
    updated_customer = customer_service.update_customer(
        customer_id,
        customer_update.model_dump(exclude_unset=True)
    )
    
    if not updated_customer:
        logger.warning(f"Customer API - Customer not found: {customer_id}")
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return updated_customer

@customer_api_router.delete("/customers/{customer_id}", status_code=204)
@required_roles(["Admin"])
async def delete_customer(
    customer_id: str = Path(..., description="The ID of the customer to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Customer API - Deleting customer: {customer_id}")
    
    success = customer_service.delete_customer(customer_id)
    
    if not success:
        logger.warning(f"Customer API - Customer not found: {customer_id}")
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return None
