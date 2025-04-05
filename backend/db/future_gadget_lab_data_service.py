from tinydb import TinyDB, Query
from tinydb.storages import MemoryStorage, JSONStorage
from pathlib import Path
import os
import datetime
import uuid  # Add this import
from typing import Dict, List, Optional, Union, Any
from enum import Enum
from common.log import logger

class WorldLineStatus(str, Enum):
    ALPHA = "alpha"
    BETA = "beta"
    STEINS_GATE = "steins_gate"
    DELTA = "delta"
    GAMMA = "gamma"
    OMEGA = "omega"
    
class ExperimentStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ABANDONED = "abandoned"

class FutureGadgetLabDataService:
    """Service for storing and retrieving research data from the Future Gadget Laboratory"""
    
    def __init__(self, use_memory_storage=False, db_path=None):
        """Initialize the database
        
        Args:
            use_memory_storage: If True, use memory storage (data will be lost when app restarts)
            db_path: Path to the JSON database file (only used if use_memory_storage is False)
        """
        self.use_memory_storage = use_memory_storage
        self.db_path = db_path or Path("./data/fgl_data.json")
        self._initialize_db()
    
    def _initialize_db(self):
        """Initialize the database with the appropriate storage option"""
        if self.use_memory_storage:
            logger.info("Using in-memory storage for FGL data")
            self.db = TinyDB(storage=MemoryStorage)
        else:
            logger.info(f"Using file storage for FGL data at {self.db_path}")
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            self.db = TinyDB(self.db_path)
        
        # Create tables
        self.experiments_table = self.db.table('experiments')
        self.d_mails_table = self.db.table('d_mails')
        self.divergence_readings_table = self.db.table('divergence_readings')
        self.lab_members_table = self.db.table('lab_members')
        
    # ----- EXPERIMENT CRUD OPERATIONS -----
    
    def get_all_experiments(self) -> List[Dict]:
        """Get all experiments"""
        return self.experiments_table.all()
    
    def get_experiment_by_id(self, experiment_id: str) -> Optional[Dict]:
        """Get experiment by ID"""
        Experiment = Query()
        results = self.experiments_table.search(Experiment.id == experiment_id)
        return results[0] if results else None
    
    def search_experiments(self, query_params: Dict) -> List[Dict]:
        """Search experiments based on query parameters"""
        Experiment = Query()
        query = None
        
        # Build query based on provided parameters
        for key, value in query_params.items():
            condition = getattr(Experiment, key) == value
            query = condition if query is None else (query & condition)
        
        # If no query parameters were valid, return all experiments
        if query is None:
            return self.get_all_experiments()
        
        return self.experiments_table.search(query)
    
    def create_experiment(self, experiment_data: Dict) -> Dict:
        """Create a new experiment"""
        if 'id' not in experiment_data:
            # Generate ID if not provided
            experiment_data['id'] = f"EXP-{uuid.uuid4()}"
        
        # Set creation timestamp if not provided
        if 'created_at' not in experiment_data:
            experiment_data['created_at'] = datetime.datetime.now().isoformat()
        
        # Insert the experiment
        self.experiments_table.insert(experiment_data)
        return experiment_data
    
    def update_experiment(self, experiment_id: str, experiment_data: Dict) -> Optional[Dict]:
        """Update an existing experiment"""
        # Get the experiment
        existing_experiment = self.get_experiment_by_id(experiment_id)
        if not existing_experiment:
            return None
        
        # Update the experiment
        Experiment = Query()
        # Remove the ID from update data if present
        if 'id' in experiment_data:
            del experiment_data['id']
        
        # Add updated_at timestamp
        experiment_data['updated_at'] = datetime.datetime.now().isoformat()
        
        # Update the experiment
        self.experiments_table.update(experiment_data, Experiment.id == experiment_id)
        
        # Return the updated experiment
        return self.get_experiment_by_id(experiment_id)
    
    def delete_experiment(self, experiment_id: str) -> bool:
        """Delete an experiment"""
        Experiment = Query()
        removed = self.experiments_table.remove(Experiment.id == experiment_id)
        return len(removed) > 0
    
    # ----- D-MAIL CRUD OPERATIONS -----
    
    def get_all_d_mails(self) -> List[Dict]:
        """Get all D-Mails"""
        return self.d_mails_table.all()
    
    def get_d_mail_by_id(self, d_mail_id: str) -> Optional[Dict]:
        """Get D-Mail by ID"""
        DMail = Query()
        results = self.d_mails_table.search(DMail.id == d_mail_id)
        return results[0] if results else None
    
    def create_d_mail(self, d_mail_data: Dict) -> Dict:
        """Create a new D-Mail"""
        if 'id' not in d_mail_data:
            # Generate ID if not provided
            current_count = len(self.d_mails_table)
            d_mail_data['id'] = f"DM-{current_count + 1:03d}"
        
        # Set timestamp if not provided
        if 'sent_timestamp' not in d_mail_data:
            d_mail_data['sent_timestamp'] = datetime.datetime.now().isoformat()
        
        # Convert divergence values to float
        if 'world_line_before' in d_mail_data and isinstance(d_mail_data['world_line_before'], str):
            d_mail_data['world_line_before'] = float(d_mail_data['world_line_before'])
            
        if 'world_line_after' in d_mail_data and isinstance(d_mail_data['world_line_after'], str):
            d_mail_data['world_line_after'] = float(d_mail_data['world_line_after'])
        
        # Insert the D-Mail
        self.d_mails_table.insert(d_mail_data)
        return d_mail_data
    
    def update_d_mail(self, d_mail_id: str, d_mail_data: Dict) -> Optional[Dict]:
        """Update an existing D-Mail"""
        # Get the D-Mail
        existing_d_mail = self.get_d_mail_by_id(d_mail_id)
        if not existing_d_mail:
            return None
        
        # Convert divergence values to float
        if 'world_line_before' in d_mail_data and isinstance(d_mail_data['world_line_before'], str):
            d_mail_data['world_line_before'] = float(d_mail_data['world_line_before'])
            
        if 'world_line_after' in d_mail_data and isinstance(d_mail_data['world_line_after'], str):
            d_mail_data['world_line_after'] = float(d_mail_data['world_line_after'])
        
        # Update the D-Mail
        DMail = Query()
        # Remove the ID from update data if present
        if 'id' in d_mail_data:
            del d_mail_data['id']
        
        # Add updated_at timestamp
        d_mail_data['updated_at'] = datetime.datetime.now().isoformat()
        
        # Update the D-Mail
        self.d_mails_table.update(d_mail_data, DMail.id == d_mail_id)
        
        # Return the updated D-Mail
        return self.get_d_mail_by_id(d_mail_id)
    
    def delete_d_mail(self, d_mail_id: str) -> bool:
        """Delete a D-Mail record"""
        DMail = Query()
        removed = self.d_mails_table.remove(DMail.id == d_mail_id)
        return len(removed) > 0
    
    # ----- DIVERGENCE METER READINGS CRUD OPERATIONS -----
    
    def get_all_divergence_readings(self) -> List[Dict]:
        """Get all divergence meter readings"""
        return self.divergence_readings_table.all()
    
    def get_divergence_reading_by_id(self, reading_id: str) -> Optional[Dict]:
        """Get divergence reading by ID"""
        Reading = Query()
        results = self.divergence_readings_table.search(Reading.id == reading_id)
        return results[0] if results else None
    
    def create_divergence_reading(self, reading_data: Dict) -> Dict:
        """Create a new divergence meter reading"""
        if 'id' not in reading_data:
            # Generate ID if not provided
            current_count = len(self.divergence_readings_table)
            reading_data['id'] = f"DR-{current_count + 1:03d}"
        
        # Set timestamp if not provided
        if 'timestamp' not in reading_data:
            reading_data['timestamp'] = datetime.datetime.now().isoformat()
            
        # Convert reading value to float if it's a string
        if 'reading' in reading_data and isinstance(reading_data['reading'], str):
            reading_data['reading'] = float(reading_data['reading'])
            
        # Also convert 'value' to float if present (used in example code)
        if 'value' in reading_data and isinstance(reading_data['value'], str):
            reading_data['value'] = float(reading_data['value'])
            
        # Set world_line_status if not provided
        if 'status' not in reading_data and 'world_line_status' not in reading_data:
            reading_data['status'] = WorldLineStatus.ALPHA.value
            
        # Insert the reading
        self.divergence_readings_table.insert(reading_data)
        return reading_data
        
    def update_divergence_reading(self, reading_id: str, reading_data: Dict) -> Optional[Dict]:
        """Update an existing divergence meter reading"""
        # Get the reading
        existing_reading = self.get_divergence_reading_by_id(reading_id)
        if not existing_reading:
            return None
        
        # Convert reading value to float if it's a string
        if 'reading' in reading_data and isinstance(reading_data['reading'], str):
            reading_data['reading'] = float(reading_data['reading'])
            
        # Also convert 'value' to float if present
        if 'value' in reading_data and isinstance(reading_data['value'], str):
            reading_data['value'] = float(reading_data['value'])
        
        # Update the reading
        Reading = Query()
        # Remove the ID from update data if present
        if 'id' in reading_data:
            del reading_data['id']
        
        # Update the reading
        self.divergence_readings_table.update(reading_data, Reading.id == reading_id)
        
        # Return the updated reading
        return self.get_divergence_reading_by_id(reading_id)
    
    def delete_divergence_reading(self, reading_id: str) -> bool:
        """Delete a divergence meter reading"""
        Reading = Query()
        removed = self.divergence_readings_table.remove(Reading.id == reading_id)
        return len(removed) > 0

    # Add missing get_latest_divergence_reading method
    def get_latest_divergence_reading(self) -> Optional[Dict]:
        """Get the most recent divergence meter reading"""
        readings = self.divergence_readings_table.all()
        if not readings:
            return None
        
        # Sort by timestamp (descending) and return the first one
        return sorted(readings, key=lambda x: x.get('timestamp', ''), reverse=True)[0]


# Create a default instance for quick testing
# In production code, you would inject this service where needed
default_fgl_db = FutureGadgetLabDataService(use_memory_storage=True)

# Example usage
if __name__ == "__main__":
    # Create a new experiment
    new_experiment = default_fgl_db.create_experiment({
        "name": "Phone Microwave (Name subject to change)",
        "description": "A microwave that can send text messages to the past",
        "status": ExperimentStatus.COMPLETED.value,
        "world_line": WorldLineStatus.ALPHA.value
    })
    
    print(f"Created experiment: {new_experiment}")
    
    # Create a new D-Mail
    new_d_mail = default_fgl_db.create_d_mail({
        "sender": "Okabe Rintaro",
        "recipient": "Okabe Rintaro (past)",
        "message": "Don't use the microwave today!",
        "world_line_before": 0.571024,  # Now a float instead of string
        "world_line_after": 1.048596    # Now a float instead of string
    })
    
    print(f"Created D-Mail: {new_d_mail}")
    
    # Create a new divergence reading
    new_reading = default_fgl_db.create_divergence_reading({
        "value": 1.048596,  # Now a float instead of string
        "world_line_status": WorldLineStatus.STEINS_GATE.value,
        "location": "Future Gadget Lab"
    })
    
    print(f"Created divergence reading: {new_reading}")