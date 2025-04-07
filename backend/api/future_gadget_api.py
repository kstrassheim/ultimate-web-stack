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
    ExperimentStatus,
    calculate_worldline_status
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

# Add a new connection manager for worldline status updates
worldline_connection_manager = ConnectionManager(
    receiver_roles=None,  # Allow any authenticated user to receive
    sender_roles=["Admin"]  # Only Admins can send
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
    
    # Broadcast updated worldline status
    await broadcast_worldline_status(experiment=created_experiment, sender=None)
    
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
    
    # Broadcast updated worldline status
    await broadcast_worldline_status(experiment=updated_experiment, sender=None)
    
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
    
    # Broadcast updated worldline status (no experiment to include since it was deleted)
    await broadcast_worldline_status(sender=None)
    
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

# New WebSocket endpoint for worldline status
@future_gadget_api_router.websocket("/ws/worldline-status")
async def worldline_status_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for worldline status updates. 
    Any authenticated user can receive updates, but only Admins can send them."""
    try:
        await worldline_connection_manager.auth_connect(websocket)
        
        try:
            while True:
                # Wait for messages (mostly for ping/pong to keep connection alive)
                data = await websocket.receive_text()
                # Only respond with current worldline status to non-admin users
                # (they can't send actual updates)
                if "Admin" not in getattr(websocket.state.user, "roles", []):
                    # Get current worldline status
                    experiments = fgl_service.get_all_experiments()
                    readings = fgl_service.get_all_divergence_readings()
                    status = calculate_worldline_status(experiments, readings)
                    
                    # Add current timestamp
                    import datetime
                    now = datetime.datetime.now(datetime.timezone.utc)
                    status["timestamp"] = now.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
                    
                    # Send current status as response
                    await worldline_connection_manager.send_personal_message(status, websocket)
        except WebSocketDisconnect:
            worldline_connection_manager.disconnect(websocket)
            logger.info(f"Client disconnected from worldline WebSocket: {websocket.state.user.get('name', 'Unknown')}")
    except Exception as e:
        logger.error(f"Worldline WebSocket error: {str(e)}")
        if websocket in worldline_connection_manager.active_connections:
            worldline_connection_manager.disconnect(websocket, log_error=False)

# Add a new function to broadcast worldline status to all connected clients
async def broadcast_worldline_status(experiment: Dict = None, sender: WebSocket = None):
    """
    Broadcast current worldline status to all connected clients.
    
    Args:
        experiment: Optional experiment to include in the calculation
                  (useful for previewing impact before saving)
        sender: WebSocket of the client that initiated the broadcast
                (needed for proper authorization in ConnectionManager)
    
    This function can be called whenever the worldline status changes.
    """
    # Get all experiments from the database
    experiments = fgl_service.get_all_experiments()
    
    # If an additional experiment is provided, include it in the calculation
    if experiment is not None and experiment.get("world_line_change") is not None:
        # Create a copy of experiments to avoid modifying the original list
        calculation_experiments = experiments.copy()
        # Add the provided experiment to the temporary calculation list
        calculation_experiments.append(experiment)
    else:
        calculation_experiments = experiments
    
    # Get all divergence readings
    readings = fgl_service.get_all_divergence_readings()
    
    # Calculate worldline status with the combined experiment list
    status = calculate_worldline_status(calculation_experiments, readings)
    
    # Add current timestamp
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    status["timestamp"] = now.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    # If preview experiment was included, add a flag to indicate this
    if experiment is not None:
        status["includes_preview"] = True
        status["preview_experiment"] = {
            "name": experiment.get("name", "Unnamed experiment"),
            "world_line_change": experiment.get("world_line_change", 0.0)
        }
    
    # Broadcast to all connected clients - FIXED: Removed sender parameter
    await worldline_connection_manager.broadcast(
        data=status, 
        type="worldline_update"
        # Removed sender parameter which was causing the error
    )
    
    # Return the status (useful when calling this function directly)
    return status

@future_gadget_api_router.get("/worldline-status", response_model=Dict)
async def get_current_worldline_status(
    token=Security(azure_scheme, scopes=scopes)
):
    """
    Calculate the current worldline status by summing all experiment divergences.
    Returns the calculated worldline value and the closest known reading.
    """
    logger.info("Future Gadget Lab API - Getting current worldline status")
    
    # Get all experiments
    experiments = fgl_service.get_all_experiments()
    
    # Get all divergence readings
    readings = fgl_service.get_all_divergence_readings()
    
    # Calculate worldline status
    response = calculate_worldline_status(experiments, readings)
    
    # Add current timestamp in JavaScript ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    response["timestamp"] = now.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    return response

@future_gadget_api_router.get("/worldline-history", response_model=List[Dict])
async def get_worldline_history(
    token=Security(azure_scheme, scopes=scopes)
):
    """
    Calculate worldline states after each experiment.
    Returns an array of worldline states showing how the worldline changed over time.
    """
    logger.info("Future Gadget Lab API - Getting worldline history")
    
    # Get all experiments
    all_experiments = fgl_service.get_all_experiments()
    
    # Get all divergence readings
    readings = fgl_service.get_all_divergence_readings()
    
    # Sort experiments by timestamp
    sorted_experiments = sorted(
        [exp for exp in all_experiments if exp.get('timestamp')],
        key=lambda x: x.get('timestamp', ''),
    )
    
    # Calculate worldline states progressively
    history = []
    accumulated_experiments = []
    
    # Add base worldline (1.0) as starting point with no experiments
    base_state = calculate_worldline_status([], readings)
    base_state["added_experiment"] = None
    history.append(base_state)
    
    # Calculate worldline after each experiment
    for experiment in sorted_experiments:
        accumulated_experiments.append(experiment)
        
        # Calculate new state with all experiments up to this point
        state = calculate_worldline_status(accumulated_experiments.copy(), readings)
        
        # Add experiment details to the state
        # state["added_experiment"] = {
        #     "id": experiment.get("id"),
        #     "name": experiment.get("name"),
        #     "world_line_change": experiment.get("world_line_change", 0),
        #     "timestamp": experiment.get("timestamp")
        # }
        
        history.append(state)
    
    # Add current timestamp to each state for consistency
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    iso_now = now.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    for state in history:
        state["timestamp"] = iso_now
    
    return history

@future_gadget_api_router.get("/divergence-readings", response_model=List[Dict])
async def get_divergence_readings(
    status: Optional[str] = Query(None, description="Filter by worldline status"),
    recorded_by: Optional[str] = Query(None, description="Filter by who recorded the reading"),
    min_value: Optional[float] = Query(None, description="Filter by minimum reading value"),
    max_value: Optional[float] = Query(None, description="Filter by maximum reading value"),
    token=Security(azure_scheme, scopes=scopes)
):
    """
    Get all divergence meter readings.
    This endpoint is accessible to all authenticated users.
    """
    logger.info("Future Gadget Lab API - Getting all divergence readings")
    readings = fgl_service.get_all_divergence_readings()
    
    # Apply filters if specified
    filtered_readings = readings
    if status:
        filtered_readings = [r for r in filtered_readings if r.get('status') == status]
    if recorded_by:
        filtered_readings = [r for r in filtered_readings if r.get('recorded_by') == recorded_by]
    if min_value is not None:
        filtered_readings = [r for r in filtered_readings if get_reading_value(r) >= min_value]
    if max_value is not None:
        filtered_readings = [r for r in filtered_readings if get_reading_value(r) <= max_value]
    
    return filtered_readings

# Helper function to extract reading value safely
def get_reading_value(reading: Dict) -> float:
    """Extract the reading value, handling different field names and types"""
    value = reading.get("reading")
    if value is None:
        value = reading.get("value")
    
    # Convert to float if it's a string
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    
    return value or 0.0