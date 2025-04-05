from fastapi import APIRouter, Security, HTTPException, Body, Path, Query, Depends
from typing import List, Dict, Optional, Union
from pydantic import BaseModel, Field, validator, field_validator
from enum import Enum
from common.auth import azure_scheme, scopes
from common.log import logger
from common.role_based_access import required_roles
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService, 
    WorldLineStatus, 
    ExperimentStatus
)

# Initialize router
future_gadget_api_router = APIRouter(prefix="/future-gadget-lab", tags=["Future Gadget Lab"])

# Initialize data service with memory storage
fgl_service = FutureGadgetLabDataService(use_memory_storage=True)

# --- Pydantic Models for Request/Response Validation ---

class ExperimentBase(BaseModel):
    name: str
    description: str 
    status: ExperimentStatus
    creator_id: str
    collaborators: List[str] = []
    results: Optional[str] = None

class ExperimentCreate(ExperimentBase):
    pass

class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ExperimentStatus] = None
    creator_id: Optional[str] = None
    collaborators: Optional[List[str]] = None
    results: Optional[str] = None

class DMailBase(BaseModel):
    sender_id: str
    recipient: str
    content: str
    target_timestamp: str
    world_line_before: Optional[float] = None  # Changed from str to float
    world_line_after: Optional[float] = None   # Changed from str to float
    observed_changes: Optional[str] = None
    
    # Validator to convert string values to float if needed
    @field_validator('world_line_before', 'world_line_after', mode='before')
    def convert_to_float(cls, v):
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except ValueError:
                raise ValueError(f"Could not convert {v} to float")
        return v

class DMailCreate(DMailBase):
    pass

class DMailUpdate(BaseModel):
    recipient: Optional[str] = None
    content: Optional[str] = None
    target_timestamp: Optional[str] = None
    world_line_before: Optional[float] = None
    world_line_after: Optional[float] = None
    observed_changes: Optional[str] = None
    
    @field_validator('world_line_before', 'world_line_after', mode='before')
    def convert_to_float(cls, v):
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except ValueError:
                raise ValueError(f"Could not convert {v} to float")
        return v

class DivergenceReadingBase(BaseModel):
    reading: float  # Changed from str to float
    status: WorldLineStatus
    recorded_by: str
    notes: Optional[str] = None
    
    # Validator to convert string reading to float, if needed
    @field_validator('reading', mode='before')
    def convert_reading_to_float(cls, v):
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except ValueError:
                raise ValueError(f"Could not convert {v} to float")
        return v

class DivergenceReadingCreate(DivergenceReadingBase):
    pass

class DivergenceReadingUpdate(BaseModel):
    reading: Optional[float] = None  # Changed from str to float
    status: Optional[WorldLineStatus] = None
    recorded_by: Optional[str] = None
    notes: Optional[str] = None
    
    @field_validator('reading', mode='before')
    def convert_reading_to_float(cls, v):
        if v is None:
            return v
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except ValueError:
                raise ValueError(f"Could not convert {v} to float")
        return v

class LabMemberBase(BaseModel):
    name: str
    codename: str
    role: str
    
class LabMemberCreate(LabMemberBase):
    lab_member_number: Optional[int] = None

class LabMemberUpdate(BaseModel):
    name: Optional[str] = None
    codename: Optional[str] = None
    role: Optional[str] = None

# --- API Routes ---

# ----- EXPERIMENTS ROUTES -----

@future_gadget_api_router.get("/experiments", response_model=List[Dict])
@required_roles(["Admin"])
async def get_all_experiments(
    name: Optional[str] = Query(None, description="Filter by experiment name"),
    status: Optional[ExperimentStatus] = Query(None, description="Filter by experiment status"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info("Future Gadget Lab API - Getting all experiments")
    if name or status:
        query_params = {}
        if name:
            query_params["name"] = name
        if status:
            query_params["status"] = status
        return fgl_service.search_experiments(query_params)
    return fgl_service.get_all_experiments()

@future_gadget_api_router.get("/experiments/{experiment_id}", response_model=Dict)
@required_roles(["Admin"])
async def get_experiment_by_id(
    experiment_id: str = Path(..., description="The ID of the experiment to retrieve"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Getting experiment with ID: {experiment_id}")
    experiment = fgl_service.get_experiment_by_id(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {experiment_id} not found")
    return experiment

@future_gadget_api_router.post("/experiments", response_model=Dict, status_code=201)
@required_roles(["Admin"])
async def create_experiment(
    experiment: ExperimentCreate,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Creating new experiment: {experiment.name}")
    created_experiment = fgl_service.create_experiment(experiment.model_dump())
    return created_experiment

@future_gadget_api_router.put("/experiments/{experiment_id}", response_model=Dict)
@required_roles(["Admin"])
async def update_experiment(
    experiment_id: str = Path(..., description="The ID of the experiment to update"),
    experiment: ExperimentUpdate = Body(...),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Updating experiment with ID: {experiment_id}")
    existing_experiment = fgl_service.get_experiment_by_id(experiment_id)
    if not existing_experiment:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {experiment_id} not found")
    updated_experiment = fgl_service.update_experiment(experiment_id, experiment.model_dump(exclude_unset=True))
    return updated_experiment

@future_gadget_api_router.delete("/experiments/{experiment_id}", response_model=Dict)
@required_roles(["Admin"])
async def delete_experiment(
    experiment_id: str = Path(..., description="The ID of the experiment to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Deleting experiment with ID: {experiment_id}")
    existing_experiment = fgl_service.get_experiment_by_id(experiment_id)
    if not existing_experiment:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {experiment_id} not found")
    success = fgl_service.delete_experiment(experiment_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete experiment with ID {experiment_id}")
    return {"message": f"Experiment with ID {experiment_id} successfully deleted"}

# ----- D-MAIL ROUTES -----

@future_gadget_api_router.get("/d-mails", response_model=List[Dict])
@required_roles(["Admin"])
async def get_all_d_mails(token=Security(azure_scheme, scopes=scopes)):
    logger.info("Future Gadget Lab API - Getting all D-Mails")
    return fgl_service.get_all_d_mails()

@future_gadget_api_router.get("/d-mails/{d_mail_id}", response_model=Dict)
@required_roles(["Admin"])
async def get_d_mail_by_id(
    d_mail_id: str = Path(..., description="The ID of the D-Mail to retrieve"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Getting D-Mail with ID: {d_mail_id}")
    d_mail = fgl_service.get_d_mail_by_id(d_mail_id)
    if not d_mail:
        raise HTTPException(status_code=404, detail=f"D-Mail with ID {d_mail_id} not found")
    return d_mail

@future_gadget_api_router.post("/d-mails", response_model=Dict, status_code=201)
@required_roles(["Admin"])
async def create_d_mail(
    d_mail: DMailCreate,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Creating new D-Mail from {d_mail.sender_id} to {d_mail.recipient}")
    created_d_mail = fgl_service.create_d_mail(d_mail.model_dump())
    return created_d_mail

@future_gadget_api_router.put("/d-mails/{d_mail_id}", response_model=Dict)
@required_roles(["Admin"])
async def update_d_mail(
    d_mail_id: str = Path(..., description="The ID of the D-Mail to update"),
    d_mail: DMailUpdate = Body(...),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Updating D-Mail with ID: {d_mail_id}")
    existing_d_mail = fgl_service.get_d_mail_by_id(d_mail_id)
    if not existing_d_mail:
        raise HTTPException(status_code=404, detail=f"D-Mail with ID {d_mail_id} not found")
    updated_d_mail = fgl_service.update_d_mail(d_mail_id, d_mail.model_dump(exclude_unset=True))
    return updated_d_mail

@future_gadget_api_router.delete("/d-mails/{d_mail_id}", response_model=Dict)
@required_roles(["Admin"])
async def delete_d_mail(
    d_mail_id: str = Path(..., description="The ID of the D-Mail to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Deleting D-Mail with ID: {d_mail_id}")
    existing_d_mail = fgl_service.get_d_mail_by_id(d_mail_id)
    if not existing_d_mail:
        raise HTTPException(status_code=404, detail=f"D-Mail with ID {d_mail_id} not found")
    success = fgl_service.delete_d_mail(d_mail_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete D-Mail with ID {d_mail_id}")
    return {"message": f"D-Mail with ID {d_mail_id} successfully deleted"}

