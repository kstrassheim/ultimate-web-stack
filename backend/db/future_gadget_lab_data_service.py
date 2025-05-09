from tinydb import TinyDB, Query
from tinydb.storages import MemoryStorage, JSONStorage
from pathlib import Path
import os
import datetime
import uuid
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
        
        # Create tables (removed d_mails_table and lab_members_table)
        self.experiments_table = self.db.table('experiments')
        self.divergence_readings_table = self.db.table('divergence_readings')
        
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
        
        # Convert world_line_change to float if it's a string
        if 'world_line_change' in experiment_data and isinstance(experiment_data['world_line_change'], str):
            experiment_data['world_line_change'] = float(experiment_data['world_line_change'])
        
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
        
        # Convert world_line_change to float if it's a string
        if 'world_line_change' in experiment_data and isinstance(experiment_data['world_line_change'], str):
            experiment_data['world_line_change'] = float(experiment_data['world_line_change'])
        
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

def generate_test_data(service: FutureGadgetLabDataService) -> Dict[str, List[Dict]]:
    """Generate test data for experiments and divergence readings"""
    # Dictionary to store all created items
    created_items = {
        "experiments": [],
        "divergence_readings": []
    }
    
    # Create base timestamp (current time)
    current_time = datetime.datetime.now(datetime.timezone.utc)
    
    # Function to format timestamp in JavaScript ISO format
    def js_iso_format(dt: datetime.datetime) -> str:
        # Format to match JavaScript's toISOString() exactly: YYYY-MM-DDTHH:mm:ss.sssZ
        return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    
    # Create experiments with both positive and negative world_line_change values
    experiments = [
        {
            "name": "Phone Microwave (Name subject to change)",
            "description": "A microwave that can send text messages to the past",
            "status": ExperimentStatus.COMPLETED.value,
            "creator_id": "Rintaro Okabe",
            "collaborators": ["Kurisu Makise", "Itaru Hashida"],
            "results": "Successfully sent messages to the past, causing world line shifts",
            "world_line_change": 0.409431,
            "timestamp": js_iso_format(current_time)  # Current time
        },
        {
            "name": "Divergence Meter",
            "description": "Device that measures the divergence between world lines",
            "status": ExperimentStatus.COMPLETED.value,
            "creator_id": "Kurisu Makise",
            "collaborators": ["Rintaro Okabe"],
            "results": "Accurately displays the current world line divergence value",
            "world_line_change": 0.000124,
            "timestamp": js_iso_format(current_time - datetime.timedelta(minutes=5))  # 5 minutes ago
        },
        {
            "name": "Time Leap Machine",
            "description": "Device that allows transferring memories to the past self",
            "status": ExperimentStatus.COMPLETED.value,
            "creator_id": "Kurisu Makise",
            "collaborators": ["Rintaro Okabe", "Itaru Hashida"],
            "results": "Successfully allows transferring consciousness to past self within 48-hour limit",
            "world_line_change": -0.000337, # Negative change - moving closer to Alpha attractor field
            "timestamp": js_iso_format(current_time - datetime.timedelta(minutes=10))  # 10 minutes ago
        },
        {
            "name": "IBN 5100 Decoder",
            "description": "Using the IBN 5100 to decode SERN's classified database",
            "status": ExperimentStatus.FAILED.value,
            "creator_id": "Itaru Hashida",
            "collaborators": ["Suzuha Amane"],
            "results": "IBN 5100 was lost before project could be completed",
            "world_line_change": -0.048256, # Negative change - experiment failure pushed timeline backwards
            "timestamp": js_iso_format(current_time - datetime.timedelta(minutes=15))  # 15 minutes ago
        },
        {
            "name": "Operation Skuld",
            "description": "Plan to reach Steins;Gate worldline and save Kurisu without changing observed history",
            "status": ExperimentStatus.COMPLETED.value,
            "creator_id": "Rintaro Okabe",
            "collaborators": ["Suzuha Amane"],
            "results": "Successfully reached Steins;Gate worldline while saving Kurisu",
            "world_line_change": 0.334137,
            "timestamp": js_iso_format(current_time - datetime.timedelta(minutes=20))  # 20 minutes ago
        },
        # Add more experiments with negative world line changes
        {
            "name": "Jelly Person Experiment",
            "description": "Experiment attempting to transform a person into jelly-like state",
            "status": ExperimentStatus.FAILED.value,
            "creator_id": "Rintaro Okabe",
            "collaborators": ["Itaru Hashida"],
            "results": "Resulted in unstable human teleportation with catastrophic failure",
            "world_line_change": -0.275349, # Significant negative change due to failure
            "timestamp": js_iso_format(current_time - datetime.timedelta(minutes=25))  # 25 minutes ago
        },
        {
            "name": "D-Mail Recovery Operation",
            "description": "Operation to undo previous D-Mail effects",
            "status": ExperimentStatus.COMPLETED.value,
            "creator_id": "Rintaro Okabe",
            "collaborators": ["Kurisu Makise", "Moeka Kiryu"],
            "results": "Successfully undid effects of previous D-Mails, returning closer to Beta attractor field",
            "world_line_change": -0.412591, # Large negative change - deliberately moving backwards
            "timestamp": js_iso_format(current_time - datetime.timedelta(minutes=30))  # 30 minutes ago
        }
    ]
    
    for exp_data in experiments:
        created_exp = service.create_experiment(exp_data)
        created_items["experiments"].append(created_exp)
    
    # Create divergence readings (existing code)
    readings = [
        {
            "reading": 1.048596,
            "status": WorldLineStatus.STEINS_GATE.value,
            "recorded_by": "Rintaro Okabe",
            "notes": "Steins;Gate worldline - mission accomplished"
        },
        {
            "reading": 0.571024,
            "status": WorldLineStatus.ALPHA.value,
            "recorded_by": "Rintaro Okabe",
            "notes": "Alpha worldline - SERN dystopia"
        },
        {
            "reading": 0.523299,
            "status": WorldLineStatus.ALPHA.value,
            "recorded_by": "Rintaro Okabe",
            "notes": "Alpha worldline variant - Mayuri dies in different way"
        },
        {
            "reading": 1.130205,
            "status": WorldLineStatus.BETA.value,
            "recorded_by": "Suzuha Amane",
            "notes": "Beta worldline - World War 3 occurs"
        },
        {
            "reading": 1.382733,
            "status": WorldLineStatus.BETA.value,
            "recorded_by": "Suzuha Amane",
            "notes": "Beta worldline variant - Failed attempt to save Kurisu"
        }
    ]
    
    for reading_data in readings:
        created_reading = service.create_divergence_reading(reading_data)
        created_items["divergence_readings"].append(created_reading)
    
    # Return all created items
    return created_items

# Create a default instance for quick testing
# In production code, you would inject this service where needed
default_fgl_db = FutureGadgetLabDataService(use_memory_storage=True)


def calculate_worldline_status(experiments, readings=None):
    """
    Calculate the current worldline by summing all experiment divergences.
    
    Args:
        experiments: List of experiment objects with world_line_change values
        readings: Optional list of divergence readings to find closest match
                 If None, only worldline value is calculated without closest reading
    
    Returns:
        Dict containing calculated worldline value and related information
    """
    # Calculate current worldline (start at 1.0 and add all divergences)
    base_worldline = 1.0
    current_worldline = base_worldline
    
    for exp in experiments:
        if exp.get("world_line_change") is not None:
            current_worldline += exp.get("world_line_change", 0.0)
    
    # Get the most recent experiment timestamp
    last_experiment_timestamp = None
    
    if experiments:
        # Sort experiments by timestamp (descending)
        sorted_experiments = sorted(
            [exp for exp in experiments if exp.get('timestamp')], 
            key=lambda x: x.get('timestamp', ''), 
            reverse=True
        )
        
        if sorted_experiments:
            last_experiment_timestamp = sorted_experiments[0].get('timestamp')
    
    # Initialize response with calculated values
    response = {
        "current_worldline": round(current_worldline, 6),
        "base_worldline": base_worldline,
        "total_divergence": round(current_worldline - base_worldline, 6),
        "experiment_count": len(experiments),
        "last_experiment_timestamp": last_experiment_timestamp
    }
    
    # Rest of the function remains unchanged
    if readings:
        closest_reading = None
        min_distance = float('inf')
        
        for reading in readings:
            # Get reading value, checking both "reading" and "value" fields
            reading_value = reading.get("reading")
            if reading_value is None:
                reading_value = reading.get("value")
            
            # Default to 0.0 if neither field exists
            if reading_value is None:
                reading_value = 0.0
            
            # Convert to float if it's a string
            if isinstance(reading_value, str):
                try:
                    reading_value = float(reading_value)
                except ValueError:
                    reading_value = 0.0
            
            distance = abs(reading_value - current_worldline)
            
            if distance < min_distance:
                min_distance = distance
                closest_reading = reading
        
        # If no readings found, create a placeholder
        if not closest_reading:
            closest_reading = {
                "reading": current_worldline,
                "status": "unknown",
                "recorded_by": "System",
                "notes": "No divergence readings available for comparison"
            }
        
        # Add closest reading to response
        response["closest_reading"] = {
            "value": closest_reading.get("reading"),
            "status": closest_reading.get("status"),
            "recorded_by": closest_reading.get("recorded_by", "Unknown"),
            "notes": closest_reading.get("notes", ""),
            "distance": round(min_distance, 6)
        }
    
    return response

# Example usage
if __name__ == "__main__":
    # Create a new experiment with world_line_change
    new_experiment = default_fgl_db.create_experiment({
        "name": "Phone Microwave (Name subject to change)",
        "description": "A microwave that can send text messages to the past",
        "status": ExperimentStatus.COMPLETED.value,
        "world_line": WorldLineStatus.ALPHA.value,
        "world_line_change": 0.337192
    })
    
    print(f"Created experiment: {new_experiment}")
    
    # Create a new divergence reading
    new_reading = default_fgl_db.create_divergence_reading({
        "value": 1.048596,  # Now a float instead of string
        "world_line_status": WorldLineStatus.STEINS_GATE.value,
        "location": "Future Gadget Lab"
    })
    
    print(f"Created divergence reading: {new_reading}")

    # Create a test instance
    test_db = FutureGadgetLabDataService(use_memory_storage=True)
    
    # Generate test data
    test_data = generate_test_data(test_db)
    
    # Print summary of created data
    print(f"Created {len(test_data['experiments'])} experiments")
    print(f"Created {len(test_data['divergence_readings'])} divergence readings")
    
    # Example of fetching data from the populated database
    print("\nCurrent Worldline:")
    latest_reading = test_db.get_latest_divergence_reading()
    if latest_reading:
        print(f"Divergence: {latest_reading['reading']}, Status: {latest_reading['status']}")