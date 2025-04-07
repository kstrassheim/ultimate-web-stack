from fastapi import APIRouter, Security, HTTPException, Body, Path, Query, Depends, WebSocket, WebSocketDisconnect
from typing import List, Dict, Optional, Union
from pydantic import BaseModel, Field, field_validator
from enum import Enum
from common.auth import azure_scheme, scopes
from common.log import logger
from common.role_based_access import required_roles
from common.socket import ConnectionManager
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService, 
    ExperimentStatus
)

# Initialize router
future_gadget_api_router = APIRouter(tags=["Future Gadget Lab"])

# Initialize data service with memory storage
fgl_service = FutureGadgetLabDataService(use_memory_storage=True)

# Create connection manager for experiments only
experiment_connection_manager = ConnectionManager(
    receiver_roles=["Admin"],
    sender_roles=["Admin"]
)

# --- Pydantic Models for Request/Response Validation ---

class ExperimentBase(BaseModel):
    name: str
    description: str 
    status: ExperimentStatus
    creator_id: str
    collaborators: List[str] = []
    results: Optional[str] = None
    world_line_change: Optional[float] = None
    timestamp: Optional[str] = None
    
    # Validator for world_line_change
    @field_validator('world_line_change', mode='before')
    def convert_to_float(cls, v):
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except ValueError:
                raise ValueError(f"Could not convert {v} to float")
        return v

class ExperimentCreate(ExperimentBase):
    pass

class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ExperimentStatus] = None
    creator_id: Optional[str] = None
    collaborators: Optional[List[str]] = None
    results: Optional[str] = None
    world_line_change: Optional[float] = None
    timestamp: Optional[str] = None
    
    # Validator for world_line_change
    @field_validator('world_line_change', mode='before')
    def convert_to_float(cls, v):
        if v is None:
            return v
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except ValueError:
                raise ValueError(f"Could not convert {v} to float")
        return v

# --- API Routes ---

# ----- EXPERIMENTS ROUTES ONLY -----

@future_gadget_api_router.get("/lab-experiments", response_model=List[Dict])
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

@future_gadget_api_router.get("/lab-experiments/{experiment_id}", response_model=Dict)
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

@future_gadget_api_router.post("/lab-experiments", response_model=Dict, status_code=201)
@required_roles(["Admin"])
async def create_experiment(
    experiment: ExperimentCreate,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Creating new experiment: {experiment.name}")
    
    # Fix: Access token properties directly instead of using .get()
    username = getattr(token, "preferred_username", "unknown")
    
    # Add creator information to track who performed this action
    created_experiment = fgl_service.create_experiment(experiment.model_dump())
    
    # Fix the broadcast call in create_experiment function
    await experiment_connection_manager.broadcast(
        data={
            **created_experiment,
            "actor": username,  # Username of who performed this action
            "type": "create"    # Include type at the top level
        },
        type="create"
    )
    
    return created_experiment

@future_gadget_api_router.put("/lab-experiments/{experiment_id}", response_model=Dict)
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
    
    # Fix: Access token properties directly instead of using .get()
    username = getattr(token, "preferred_username", "unknown")
    
    updated_experiment = fgl_service.update_experiment(experiment_id, experiment.model_dump(exclude_unset=True))
    
    # Fix the broadcast call in update_experiment function
    await experiment_connection_manager.broadcast(
        data={
            **updated_experiment,
            "actor": username,  # Username of who performed this action
            "type": "update"    # Include type at the top level
        },
        type="update"
    )
    
    return updated_experiment

@future_gadget_api_router.delete("/lab-experiments/{experiment_id}", response_model=Dict)
@required_roles(["Admin"])
async def delete_experiment(
    experiment_id: str = Path(..., description="The ID of the experiment to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Deleting experiment with ID: {experiment_id}")
    
    experiment = fgl_service.get_experiment_by_id(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {experiment_id} not found")
    
    # Fix: Access token properties directly instead of using .get()
    username = getattr(token, "preferred_username", "unknown")
    
    success = fgl_service.delete_experiment(experiment_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete experiment with ID {experiment_id}")
    
    # Fix the broadcast call in delete_experiment function
    await experiment_connection_manager.broadcast(
        data={
            "id": experiment_id, 
            "name": experiment.get("name", "Unknown"),
            "actor": username,  # Username of who performed this action
            "type": "delete"    # Include type at the top level
        },
        type="delete"
    )
    
    return {"message": f"Experiment with ID {experiment_id} successfully deleted"}

# WebSocket endpoint for experiments only
@future_gadget_api_router.websocket("/ws/lab-experiments")
async def experiment_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for experiment data updates"""
    try:
        await experiment_connection_manager.auth_connect(websocket)
        
        try:
            while True:
                data = await websocket.receive_text()
                await experiment_connection_manager.send_personal_message(f"Experiment channel: {data}", websocket)
        except WebSocketDisconnect:
            experiment_connection_manager.disconnect(websocket)
            logger.info(f"Client disconnected from experiment WebSocket: {websocket.state.user.get('name', 'Unknown')}")
    except Exception as e:
        logger.error(f"Experiment WebSocket error: {str(e)}")
        if websocket in experiment_connection_manager.active_connections:
            experiment_connection_manager.disconnect(websocket)

