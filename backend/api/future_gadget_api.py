from fastapi import APIRouter, Security, HTTPException, Body, Path, Query, Depends, WebSocket, WebSocketDisconnect
from typing import List, Dict, Optional, Union
from pydantic import BaseModel, Field, validator, field_validator
from enum import Enum
from common.auth import azure_scheme, scopes
from common.log import logger
from common.role_based_access import required_roles
from common.socket import ConnectionManager
from db.future_gadget_lab_data_service import (
    FutureGadgetLabDataService, 
    WorldLineStatus, 
    ExperimentStatus
)

# Initialize router
future_gadget_api_router = APIRouter(tags=["Future Gadget Lab"])

# Initialize data service with memory storage
fgl_service = FutureGadgetLabDataService(use_memory_storage=True)

# Create separate connection managers for each entity type with proper role permissions
experiment_connection_manager = ConnectionManager(
    receiver_roles=["Admin"],  # Only Admin can connect to receive updates
    sender_roles=["Admin"]     # Only Admin can send updates
)

d_mail_connection_manager = ConnectionManager(
    receiver_roles=["Admin"], 
    sender_roles=["Admin"]
)

divergence_reading_connection_manager = ConnectionManager(
    receiver_roles=["Admin"],
    sender_roles=["Admin"]
)

lab_member_connection_manager = ConnectionManager(
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
    created_experiment = fgl_service.create_experiment(experiment.model_dump())
    
    # Use the new broadcast method for simplified notification
    await experiment_connection_manager.broadcast(
        data=created_experiment,
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
    
    updated_experiment = fgl_service.update_experiment(experiment_id, experiment.model_dump(exclude_unset=True))
    
    # Use broadcast method
    await experiment_connection_manager.broadcast(
        data=updated_experiment,
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
    
    # Get the experiment before deletion to include in the notification
    experiment = fgl_service.get_experiment_by_id(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {experiment_id} not found")
    
    success = fgl_service.delete_experiment(experiment_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete experiment with ID {experiment_id}")
    
    # Use broadcast with minimal data for delete operation
    await experiment_connection_manager.broadcast(
        data={"id": experiment_id, "name": experiment.get("name", "Unknown")},
        type="delete"
    )
    
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
    logger.info(f"Future Gadget Lab API - Creating new D-Mail from sender: {d_mail.sender_id}")
    created_d_mail = fgl_service.create_d_mail(d_mail.model_dump())
    
    # Notify all connected clients about the new D-Mail
    for connection in d_mail_connection_manager.active_connections:
        await d_mail_connection_manager.send_data(
            data=created_d_mail,
            type="create",
            websocket=connection
        )
    
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
    
    # Notify all connected clients about the updated D-Mail
    for connection in d_mail_connection_manager.active_connections:
        await d_mail_connection_manager.send_data(
            data=updated_d_mail,
            type="update",
            websocket=connection
        )
    
    return updated_d_mail

@future_gadget_api_router.delete("/d-mails/{d_mail_id}", response_model=Dict)
@required_roles(["Admin"])
async def delete_d_mail(
    d_mail_id: str = Path(..., description="The ID of the D-Mail to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Deleting D-Mail with ID: {d_mail_id}")
    
    # Get the D-Mail before deletion to include in the notification
    d_mail = fgl_service.get_d_mail_by_id(d_mail_id)
    if not d_mail:
        raise HTTPException(status_code=404, detail=f"D-Mail with ID {d_mail_id} not found")
    
    success = fgl_service.delete_d_mail(d_mail_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete D-Mail with ID {d_mail_id}")
    
    # Notify all connected clients about the deleted D-Mail
    for connection in d_mail_connection_manager.active_connections:
        await d_mail_connection_manager.send_data(
            data={"id": d_mail_id, "sender_id": d_mail.get("sender_id", "Unknown")},
            type="delete",
            websocket=connection
        )
    
    return {"message": f"D-Mail with ID {d_mail_id} successfully deleted"}

# ----- DIVERGENCE METER READINGS ROUTES -----

@future_gadget_api_router.get("/divergence-readings", response_model=List[Dict])
@required_roles(["Admin"])
async def get_all_divergence_readings(token=Security(azure_scheme, scopes=scopes)):
    logger.info("Future Gadget Lab API - Getting all divergence readings")
    return fgl_service.get_all_divergence_readings()

@future_gadget_api_router.get("/divergence-readings/{reading_id}", response_model=Dict)
@required_roles(["Admin"])
async def get_divergence_reading_by_id(
    reading_id: str = Path(..., description="The ID of the divergence reading to retrieve"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Getting divergence reading with ID: {reading_id}")
    reading = fgl_service.get_divergence_reading_by_id(reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail=f"Divergence reading with ID {reading_id} not found")
    return reading

@future_gadget_api_router.post("/divergence-readings", response_model=Dict, status_code=201)
@required_roles(["Admin"])
async def create_divergence_reading(
    reading: DivergenceReadingCreate,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Creating new divergence reading from {reading.recorded_by}")
    created_reading = fgl_service.create_divergence_reading(reading.model_dump())
    
    # Notify all connected clients about the new reading
    for connection in divergence_reading_connection_manager.active_connections:
        await divergence_reading_connection_manager.send_data(
            data=created_reading,
            type="create",
            websocket=connection
        )
        
    return created_reading

@future_gadget_api_router.put("/divergence-readings/{reading_id}", response_model=Dict)
@required_roles(["Admin"])
async def update_divergence_reading(
    reading_id: str = Path(..., description="The ID of the divergence reading to update"),
    reading: DivergenceReadingUpdate = Body(...),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Updating divergence reading with ID: {reading_id}")
    existing_reading = fgl_service.get_divergence_reading_by_id(reading_id)
    if not existing_reading:
        raise HTTPException(status_code=404, detail=f"Divergence reading with ID {reading_id} not found")
    
    updated_reading = fgl_service.update_divergence_reading(reading_id, reading.model_dump(exclude_unset=True))
    
    # Notify all connected clients about the updated reading
    for connection in divergence_reading_connection_manager.active_connections:
        await divergence_reading_connection_manager.send_data(
            data=updated_reading,
            type="update",
            websocket=connection
        )
        
    return updated_reading

@future_gadget_api_router.delete("/divergence-readings/{reading_id}", response_model=Dict)
@required_roles(["Admin"])
async def delete_divergence_reading(
    reading_id: str = Path(..., description="The ID of the divergence reading to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Deleting divergence reading with ID: {reading_id}")
    
    # Get the reading before deletion to include in the notification
    reading = fgl_service.get_divergence_reading_by_id(reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail=f"Divergence reading with ID {reading_id} not found")
    
    success = fgl_service.delete_divergence_reading(reading_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete divergence reading with ID {reading_id}")
    
    # Notify all connected clients about the deleted reading
    for connection in divergence_reading_connection_manager.active_connections:
        await divergence_reading_connection_manager.send_data(
            data={"id": reading_id, "reading": reading.get("reading", "Unknown")},
            type="delete",
            websocket=connection
        )
        
    return {"message": f"Divergence reading with ID {reading_id} successfully deleted"}

# ----- LAB MEMBER ROUTES -----

@future_gadget_api_router.get("/lab-members", response_model=List[Dict])
@required_roles(["Admin"])
async def get_all_lab_members(token=Security(azure_scheme, scopes=scopes)):
    logger.info("Future Gadget Lab API - Getting all lab members")
    return fgl_service.get_all_lab_members()

@future_gadget_api_router.get("/lab-members/{member_id}", response_model=Dict)
@required_roles(["Admin"])
async def get_lab_member_by_id(
    member_id: str = Path(..., description="The ID of the lab member to retrieve"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Getting lab member with ID: {member_id}")
    member = fgl_service.get_lab_member_by_id(member_id)
    if not member:
        raise HTTPException(status_code=404, detail=f"Lab member with ID {member_id} not found")
    return member

@future_gadget_api_router.post("/lab-members", response_model=Dict, status_code=201)
@required_roles(["Admin"])
async def create_lab_member(
    member: LabMemberCreate,
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Creating new lab member: {member.name}")
    created_member = fgl_service.create_lab_member(member.model_dump())
    
    # Notify all connected clients about the new lab member
    for connection in lab_member_connection_manager.active_connections:
        await lab_member_connection_manager.send_data(
            data=created_member,
            type="create",
            websocket=connection
        )
        
    return created_member

@future_gadget_api_router.put("/lab-members/{member_id}", response_model=Dict)
@required_roles(["Admin"])
async def update_lab_member(
    member_id: str = Path(..., description="The ID of the lab member to update"),
    member: LabMemberUpdate = Body(...),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Updating lab member with ID: {member_id}")
    existing_member = fgl_service.get_lab_member_by_id(member_id)
    if not existing_member:
        raise HTTPException(status_code=404, detail=f"Lab member with ID {member_id} not found")
    
    updated_member = fgl_service.update_lab_member(member_id, member.model_dump(exclude_unset=True))
    
    # Notify all connected clients about the updated lab member
    for connection in lab_member_connection_manager.active_connections:
        await lab_member_connection_manager.send_data(
            data=updated_member,
            type="update",
            websocket=connection
        )
        
    return updated_member

@future_gadget_api_router.delete("/lab-members/{member_id}", response_model=Dict)
@required_roles(["Admin"])
async def delete_lab_member(
    member_id: str = Path(..., description="The ID of the lab member to delete"),
    token=Security(azure_scheme, scopes=scopes)
):
    logger.info(f"Future Gadget Lab API - Deleting lab member with ID: {member_id}")
    
    # Get the lab member before deletion to include in the notification
    member = fgl_service.get_lab_member_by_id(member_id)
    if not member:
        raise HTTPException(status_code=404, detail=f"Lab member with ID {member_id} not found")
    
    success = fgl_service.delete_lab_member(member_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete lab member with ID {member_id}")
    
    # Notify all connected clients about the deleted lab member
    for connection in lab_member_connection_manager.active_connections:
        await lab_member_connection_manager.send_data(
            data={"id": member_id, "name": member.get("name", "Unknown")},
            type="delete",
            websocket=connection
        )
        
    return {"message": f"Lab member with ID {member_id} successfully deleted"}

# WebSocket endpoints for real-time updates
@future_gadget_api_router.websocket("/ws/experiments")
async def experiment_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for experiment data updates"""
    try:
        # Remove the required_roles parameter - now defined in the manager's constructor
        await experiment_connection_manager.auth_connect(websocket)
        
        try:
            # Keep connection alive
            while True:
                # Wait for any messages (mostly to detect disconnection)
                data = await websocket.receive_text()
                await experiment_connection_manager.send_personal_message(f"Experiment channel: {data}", websocket)
        except WebSocketDisconnect:
            experiment_connection_manager.disconnect(websocket)
            logger.info(f"Client disconnected from experiment WebSocket: {websocket.state.user.get('name', 'Unknown')}")
    except Exception as e:
        logger.error(f"Experiment WebSocket error: {str(e)}")
        if websocket in experiment_connection_manager.active_connections:
            experiment_connection_manager.disconnect(websocket)

@future_gadget_api_router.websocket("/ws/d-mails")
async def d_mail_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for D-Mail data updates"""
    try:
        # Remove the required_roles parameter - now defined in the manager's constructor
        await d_mail_connection_manager.auth_connect(websocket)
        
        try:
            # Keep connection alive
            while True:
                # Wait for any messages (mostly to detect disconnection)
                data = await websocket.receive_text()
                await d_mail_connection_manager.send_personal_message(f"D-Mail channel: {data}", websocket)
        except WebSocketDisconnect:
            d_mail_connection_manager.disconnect(websocket)
            logger.info(f"Client disconnected from D-Mail WebSocket: {websocket.state.user.get('name', 'Unknown')}")
    except Exception as e:
        logger.error(f"D-Mail WebSocket error: {str(e)}")
        if websocket in d_mail_connection_manager.active_connections:
            d_mail_connection_manager.disconnect(websocket)

@future_gadget_api_router.websocket("/ws/divergence-readings")
async def divergence_reading_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for divergence meter reading updates"""
    try:
        # Remove the required_roles parameter - now defined in the manager's constructor
        await divergence_reading_connection_manager.auth_connect(websocket)
        
        try:
            # Keep connection alive
            while True:
                # Wait for any messages (mostly to detect disconnection)
                data = await websocket.receive_text()
                await divergence_reading_connection_manager.send_personal_message(f"Divergence reading channel: {data}", websocket)
        except WebSocketDisconnect:
            divergence_reading_connection_manager.disconnect(websocket)
            logger.info(f"Client disconnected from divergence reading WebSocket: {websocket.state.user.get('name', 'Unknown')}")
    except Exception as e:
        logger.error(f"Divergence reading WebSocket error: {str(e)}")
        if websocket in divergence_reading_connection_manager.active_connections:
            divergence_reading_connection_manager.disconnect(websocket)

@future_gadget_api_router.websocket("/ws/lab-members")
async def lab_member_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for lab member data updates"""
    try:
        # Remove the required_roles parameter - now defined in the manager's constructor
        await lab_member_connection_manager.auth_connect(websocket)
        
        try:
            # Keep connection alive
            while True:
                # Wait for any messages (mostly to detect disconnection)
                data = await websocket.receive_text()
                await lab_member_connection_manager.send_personal_message(f"Lab member channel: {data}", websocket)
        except WebSocketDisconnect:
            lab_member_connection_manager.disconnect(websocket)
            logger.info(f"Client disconnected from lab member WebSocket: {websocket.state.user.get('name', 'Unknown')}")
    except Exception as e:
        logger.error(f"Lab member WebSocket error: {str(e)}")
        if websocket in lab_member_connection_manager.active_connections:
            lab_member_connection_manager.disconnect(websocket)

