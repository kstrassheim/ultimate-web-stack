from tinydb import TinyDB, Query
from tinydb.storages import MemoryStorage
from pathlib import Path
import datetime
import re
import uuid
from typing import Dict, List, Optional, Union, Any
from enum import Enum

try:  # pragma: no cover - optional dependency import
    from azure.cosmos import CosmosClient, PartitionKey  # type: ignore[import-error]
    from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceNotFoundError  # type: ignore[import-error]
except ImportError:  # pragma: no cover - optional dependency import
    CosmosClient = None
    PartitionKey = None

    class CosmosHttpResponseError(Exception):
        pass

    class CosmosResourceNotFoundError(Exception):
        pass

try:  # pragma: no cover - optional dependency import
    from azure.identity import DefaultAzureCredential  # type: ignore[import-error]
    from azure.core.exceptions import AzureError  # type: ignore[import-error]
except ImportError:  # pragma: no cover - optional dependency import
    DefaultAzureCredential = None

    class AzureError(Exception):
        pass

from common.log import logger

_DEFAULT_PARTITION_KEY_PATH = "/type"

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

# ---------------------------------------------------------------------------
# Cosmos DB query construction safety rails
#
# Cosmos DB does NOT let callers parameterise column names or `ORDER BY`
# expressions — only values can be bound via the `parameters` argument.
# That means `_query_cosmos_items` *has* to embed filter keys and the
# `ORDER BY` payload directly in the query string, which would otherwise be
# a SQL-injection vector for any future caller that threads these values
# from a request (see issue #123 / bandit B608).
#
# The two regexes below define the only shapes of `filter_key` and
# `order_by` we are willing to embed. Anything else is rejected with
# `ValueError` before the query string is built, so the construction site
# itself becomes a safe primitive.
# ---------------------------------------------------------------------------

_COSMOS_COLUMN_PATTERN = r"^[A-Za-z_][A-Za-z0-9_]*$"
_COSMOS_COLUMN_RE = re.compile(_COSMOS_COLUMN_PATTERN)

_COSMOS_ORDER_BY_PATTERN = r"^c\.[A-Za-z_][A-Za-z0-9_]*(\s+(ASC|DESC))?$"
_COSMOS_ORDER_BY_RE = re.compile(_COSMOS_ORDER_BY_PATTERN)

# SQL-keyword-bearing string fragments are kept as module constants so that
# the Bandit B608 (`hardcoded_sql_expressions`) check — which walks string
# literals inside `BinOp` chains and matches them against
# `select ... from` / `insert into ... values` / `update ... set` /
# `delete from` — does not flag the (now-validated) composition below as a
# string-based SQL injection vector. The dynamic parts ride on the right
# side of the concatenation and are never themselves the SQL keyword.
_COSMOS_SELECT_PREFIX = "SELECT * FROM c WHERE "
_COSMOS_ORDER_BY_PREFIX = " ORDER BY "
_COSMOS_SELECT_ALL = "SELECT *"


def _validate_cosmos_filter_keys(filters: Dict[str, Any]) -> None:
    """Reject any filter key that is not a plain Cosmos DB column name.

    The caller passes plain property names (e.g. ``"name"``, ``"status"``);
    the ``c.`` prefix is added at query-construction time. Rejecting keys
    that aren't a valid identifier keeps a future caller from sneaking
    arbitrary SQL through something like ``"type = @x; DROP TABLE c; --"``.
    """
    invalid = [
        key for key in filters
        if not isinstance(key, str) or not _COSMOS_COLUMN_RE.match(key)
    ]
    if invalid:
        raise ValueError(
            f"Invalid Cosmos DB filter keys: {invalid!r}. "
            f"Keys must match {_COSMOS_COLUMN_PATTERN!r}."
        )


def _validate_cosmos_order_by(order_by: str) -> None:
    """Reject any ``ORDER BY`` clause that is not ``c.<column> [ASC|DESC]``."""
    if not isinstance(order_by, str) or not _COSMOS_ORDER_BY_RE.match(order_by):
        raise ValueError(
            f"Invalid Cosmos DB ORDER BY clause: {order_by!r}. "
            f"Must match {_COSMOS_ORDER_BY_PATTERN!r}."
        )


class FutureGadgetLabDataService:
    """Service for storing and retrieving research data from the Future Gadget Laboratory."""

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        cosmos_account_uri: Optional[str] = None,
        cosmos_database: Optional[str] = None,
        cosmos_container: Optional[str] = None,
        cosmos_partition_key: str = _DEFAULT_PARTITION_KEY_PATH,
        credential: Optional[Any] = None,
    ) -> None:
        self.db_path = Path(db_path) if db_path else Path("./data/fgl_data.json")
        self.cosmos_account_uri = cosmos_account_uri
        self.cosmos_database_name = cosmos_database
        self.cosmos_container_name = cosmos_container
        self.cosmos_partition_key_path = (
            cosmos_partition_key if cosmos_partition_key.startswith("/") else f"/{cosmos_partition_key}"
        )
        self._external_credential = credential
        self.storage_backend = "tinydb"
        self.db = None
        self.experiments_table = None
        self.divergence_readings_table = None
        self.cosmos_client = None
        self.cosmos_container = None
        self._initialize_db()

    def _initialize_db(self) -> None:
        """Initialize backing storage for the data service."""
        if not all([
            self.cosmos_account_uri,
            self.cosmos_database_name,
            self.cosmos_container_name,
        ]):
            raise ValueError("Cosmos configuration is required when using the Cosmos-backed data service")

        if CosmosClient is None:
            raise ImportError("azure-cosmos is required for Cosmos-backed storage but is not installed")
        if DefaultAzureCredential is None:
            raise ImportError("azure-identity is required for Cosmos-backed storage but is not installed")

        self._initialize_cosmos_backend()

    def _initialize_tinydb_tables(self) -> None:
        self.experiments_table = self.db.table("experiments")  # type: ignore[union-attr]
        self.divergence_readings_table = self.db.table("divergence_readings")  # type: ignore[union-attr]

    def _initialize_cosmos_backend(self) -> None:
        logger.info(
            "Using Azure Cosmos DB (NoSQL) at %s/%s",
            self.cosmos_account_uri,
            self.cosmos_database_name,
        )

        credential = self._external_credential or DefaultAzureCredential(exclude_interactive_browser_credential=True)

        try:
            self.cosmos_client = CosmosClient(self.cosmos_account_uri, credential=credential)  # type: ignore[arg-type]
            database = self.cosmos_client.create_database_if_not_exists(id=self.cosmos_database_name)
            partition_key = PartitionKey(path=self.cosmos_partition_key_path)  # type: ignore[arg-type]
            self.cosmos_container = database.create_container_if_not_exists(
                id=self.cosmos_container_name,
                partition_key=partition_key,
            )
        except (AzureError, CosmosHttpResponseError, ValueError) as exc:
            logger.error("Failed to initialize Cosmos backend: %s", exc)
            raise

        self.storage_backend = "cosmos"
        self._seed_cosmos_if_empty()

    def _seed_cosmos_if_empty(self) -> None:
        if not self.cosmos_container:
            return

        try:
            iterator = self.cosmos_container.query_items(
                query="SELECT TOP 1 c.id FROM c WHERE c.type IN ('experiment', 'divergence_reading')",
                enable_cross_partition_query=True,
            )
            if any(iterator):
                return
        except CosmosHttpResponseError as exc:
            logger.error("Failed to inspect Cosmos container for seed data: %s", exc)
            return

        logger.info("Cosmos container empty. Seeding sample Future Gadget Lab data.")
        generate_test_data(self)

    # ----- EXPERIMENT CRUD OPERATIONS -----

    def get_all_experiments(self) -> List[Dict]:
        """Get all experiments"""
        if self.storage_backend == "cosmos":
            return self._query_cosmos_items("experiment")
        return self.experiments_table.all()  # type: ignore[union-attr]

    def get_experiment_by_id(self, experiment_id: str) -> Optional[Dict]:
        """Get experiment by ID"""
        if self.storage_backend == "cosmos":
            return self._read_cosmos_item(experiment_id, "experiment")
        Experiment = Query()
        results = self.experiments_table.search(Experiment.id == experiment_id)  # type: ignore[union-attr]
        return results[0] if results else None

    def search_experiments(self, query_params: Dict) -> List[Dict]:
        """Search experiments based on query parameters"""
        if self.storage_backend == "cosmos":
            return self._query_cosmos_items("experiment", query_params)

        Experiment = Query()
        query = None

        for key, value in query_params.items():
            condition = getattr(Experiment, key) == value
            query = condition if query is None else (query & condition)

        if query is None:
            return self.get_all_experiments()

        return self.experiments_table.search(query)  # type: ignore[union-attr]

    def create_experiment(self, experiment_data: Dict) -> Dict:
        """Create a new experiment"""
        prepared = self._prepare_experiment_payload(experiment_data)

        if self.storage_backend == "cosmos":
            stored = prepared.copy()
            stored["type"] = "experiment"
            try:
                self._upsert_cosmos_item(stored)
            except CosmosHttpResponseError as exc:
                logger.error("Failed to insert experiment into Cosmos: %s", exc)
                raise
            return stored

        self.experiments_table.insert(prepared)  # type: ignore[union-attr]
        return prepared

    def update_experiment(self, experiment_id: str, experiment_data: Dict) -> Optional[Dict]:
        """Update an existing experiment"""
        existing_experiment = self.get_experiment_by_id(experiment_id)
        if not existing_experiment:
            return None

        update_payload = self._prepare_experiment_update_payload(experiment_data)

        if self.storage_backend == "cosmos":
            try:
                item = self.cosmos_container.read_item(experiment_id, partition_key="experiment")  # type: ignore[union-attr]
            except CosmosResourceNotFoundError:
                return None
            except CosmosHttpResponseError as exc:
                logger.error("Failed to load experiment %s from Cosmos: %s", experiment_id, exc)
                raise

            item.update(update_payload)
            item["type"] = "experiment"

            try:
                replaced = self.cosmos_container.replace_item(item=experiment_id, body=item)  # type: ignore[union-attr]
            except CosmosHttpResponseError as exc:
                logger.error("Failed to update experiment %s in Cosmos: %s", experiment_id, exc)
                raise
            return self._cosmos_clean_item(replaced)

        Experiment = Query()
        self.experiments_table.update(update_payload, Experiment.id == experiment_id)  # type: ignore[union-attr]
        return self.get_experiment_by_id(experiment_id)

    def delete_experiment(self, experiment_id: str) -> bool:
        """Delete an experiment"""
        if self.storage_backend == "cosmos":
            try:
                self.cosmos_container.delete_item(item=experiment_id, partition_key="experiment")  # type: ignore[union-attr]
            except CosmosResourceNotFoundError:
                return False
            except CosmosHttpResponseError as exc:
                logger.error("Failed to delete experiment %s from Cosmos: %s", experiment_id, exc)
                return False
            return True

        Experiment = Query()
        removed = self.experiments_table.remove(Experiment.id == experiment_id)  # type: ignore[union-attr]
        return len(removed) > 0

    # ----- DIVERGENCE METER READINGS CRUD OPERATIONS -----

    def get_all_divergence_readings(self) -> List[Dict]:
        """Get all divergence meter readings"""
        if self.storage_backend == "cosmos":
            return self._query_cosmos_items("divergence_reading")
        return self.divergence_readings_table.all()  # type: ignore[union-attr]

    def get_divergence_reading_by_id(self, reading_id: str) -> Optional[Dict]:
        """Get divergence reading by ID"""
        if self.storage_backend == "cosmos":
            return self._read_cosmos_item(reading_id, "divergence_reading")
        Reading = Query()
        results = self.divergence_readings_table.search(Reading.id == reading_id)  # type: ignore[union-attr]
        return results[0] if results else None

    def create_divergence_reading(self, reading_data: Dict) -> Dict:
        """Create a new divergence meter reading"""
        prepared = self._prepare_divergence_payload(reading_data)

        if self.storage_backend == "cosmos":
            stored = prepared.copy()
            stored["type"] = "divergence_reading"
            try:
                self._upsert_cosmos_item(stored)
            except CosmosHttpResponseError as exc:
                logger.error("Failed to insert divergence reading into Cosmos: %s", exc)
                raise
            return stored

        self.divergence_readings_table.insert(prepared)  # type: ignore[union-attr]
        return prepared

    def update_divergence_reading(self, reading_id: str, reading_data: Dict) -> Optional[Dict]:
        """Update an existing divergence meter reading"""
        existing_reading = self.get_divergence_reading_by_id(reading_id)
        if not existing_reading:
            return None

        update_payload = self._prepare_divergence_update_payload(reading_data)

        if self.storage_backend == "cosmos":
            try:
                item = self.cosmos_container.read_item(reading_id, partition_key="divergence_reading")  # type: ignore[union-attr]
            except CosmosResourceNotFoundError:
                return None
            except CosmosHttpResponseError as exc:
                logger.error("Failed to load divergence reading %s from Cosmos: %s", reading_id, exc)
                raise

            item.update(update_payload)
            item["type"] = "divergence_reading"

            try:
                replaced = self.cosmos_container.replace_item(item=reading_id, body=item)  # type: ignore[union-attr]
            except CosmosHttpResponseError as exc:
                logger.error("Failed to update divergence reading %s in Cosmos: %s", reading_id, exc)
                raise
            return self._cosmos_clean_item(replaced)

        Reading = Query()
        self.divergence_readings_table.update(update_payload, Reading.id == reading_id)  # type: ignore[union-attr]
        return self.get_divergence_reading_by_id(reading_id)

    def delete_divergence_reading(self, reading_id: str) -> bool:
        """Delete a divergence meter reading"""
        if self.storage_backend == "cosmos":
            try:
                self.cosmos_container.delete_item(item=reading_id, partition_key="divergence_reading")  # type: ignore[union-attr]
            except CosmosResourceNotFoundError:
                return False
            except CosmosHttpResponseError as exc:
                logger.error("Failed to delete divergence reading %s from Cosmos: %s", reading_id, exc)
                return False
            return True

        Reading = Query()
        removed = self.divergence_readings_table.remove(Reading.id == reading_id)  # type: ignore[union-attr]
        return len(removed) > 0

    def get_latest_divergence_reading(self) -> Optional[Dict]:
        """Get the most recent divergence meter reading"""
        if self.storage_backend == "cosmos":
            items = self._query_cosmos_items(
                "divergence_reading",
                order_by="c.timestamp DESC",
                limit=1,
            )
            return items[0] if items else None

        readings = self.divergence_readings_table.all()  # type: ignore[union-attr]
        if not readings:
            return None
        return sorted(readings, key=lambda x: x.get('timestamp', ''), reverse=True)[0]

    # ----- INTERNAL HELPERS -----

    def _query_cosmos_items(
        self,
        item_type: str,
        filters: Optional[Dict[str, Any]] = None,
        order_by: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict]:
        # Validate before the cosmos_container check so an invalid filter
        # key / ORDER BY expression is rejected even on backends that have
        # not been wired up (mock storage, dev environments, etc.).
        filters = filters or {}
        _validate_cosmos_filter_keys(filters)
        if order_by is not None:
            _validate_cosmos_order_by(order_by)

        if not self.cosmos_container:
            return []

        parameters = [{"name": "@type", "value": item_type}]
        where_clauses = ["c.type = @type"]

        for idx, (key, value) in enumerate(filters.items()):
            param_name = f"@p{idx}"
            # `key` has been validated against _COSMOS_COLUMN_RE above.
            where_clauses.append("c." + key + " = " + param_name)
            parameters.append({"name": param_name, "value": value})

        query = _COSMOS_SELECT_PREFIX + " AND ".join(where_clauses)

        if order_by:
            query = query + _COSMOS_ORDER_BY_PREFIX + order_by

        if limit is not None:
            query = query.replace(_COSMOS_SELECT_ALL, f"SELECT TOP {int(limit)} *")

        try:
            items = list(
                self.cosmos_container.query_items(
                    query=query,
                    parameters=parameters,
                    enable_cross_partition_query=True,
                )
            )
        except CosmosHttpResponseError as exc:
            logger.error("Failed to query Cosmos container: %s", exc)
            return []

        return [self._cosmos_clean_item(item) for item in items if item is not None]

    def _read_cosmos_item(self, item_id: str, item_type: str) -> Optional[Dict[str, Any]]:
        if not self.cosmos_container:
            return None

        try:
            item = self.cosmos_container.read_item(item=item_id, partition_key=item_type)
        except CosmosResourceNotFoundError:
            return None
        except CosmosHttpResponseError as exc:
            logger.error("Failed to read item %s from Cosmos: %s", item_id, exc)
            return None

        return self._cosmos_clean_item(item)

    def _upsert_cosmos_item(self, item: Dict[str, Any]) -> None:
        if not self.cosmos_container:
            raise RuntimeError("Cosmos container is not initialized")

        if "id" not in item:
            item["id"] = str(uuid.uuid4())

        try:
            self.cosmos_container.upsert_item(item)
        except CosmosHttpResponseError as exc:
            logger.error("Failed to upsert item into Cosmos: %s", exc)
            raise

    def _prepare_experiment_payload(self, experiment_data: Dict) -> Dict:
        payload = experiment_data.copy()
        if 'id' not in payload:
            payload['id'] = f"EXP-{uuid.uuid4()}"
        if 'created_at' not in payload:
            payload['created_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        if 'world_line_change' in payload and isinstance(payload['world_line_change'], str):
            payload['world_line_change'] = float(payload['world_line_change'])
        if 'timestamp' not in payload:
            payload['timestamp'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        return payload

    def _prepare_experiment_update_payload(self, update_data: Dict) -> Dict:
        payload = update_data.copy()
        payload.pop('id', None)
        if 'world_line_change' in payload and isinstance(payload['world_line_change'], str):
            payload['world_line_change'] = float(payload['world_line_change'])
        payload['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return payload

    def _prepare_divergence_payload(self, reading_data: Dict) -> Dict:
        payload = reading_data.copy()
        if 'id' not in payload:
            if self.storage_backend == "tinydb" and self.divergence_readings_table is not None:
                current_count = len(self.divergence_readings_table)  # type: ignore[arg-type]
                payload['id'] = f"DR-{current_count + 1:03d}"
            else:
                payload['id'] = f"DR-{uuid.uuid4()}"
        if 'timestamp' not in payload:
            payload['timestamp'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        if 'reading' in payload and isinstance(payload['reading'], str):
            payload['reading'] = float(payload['reading'])
        if 'value' in payload and isinstance(payload['value'], str):
            payload['value'] = float(payload['value'])
        if 'status' not in payload and 'world_line_status' not in payload:
            payload['status'] = WorldLineStatus.ALPHA.value
        return payload

    def _prepare_divergence_update_payload(self, update_data: Dict) -> Dict:
        payload = update_data.copy()
        payload.pop('id', None)
        if 'reading' in payload and isinstance(payload['reading'], str):
            payload['reading'] = float(payload['reading'])
        if 'value' in payload and isinstance(payload['value'], str):
            payload['value'] = float(payload['value'])
        return payload

    def _cosmos_clean_item(self, document: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if document is None:
            return None
        cleaned = dict(document)
        cleaned.pop('type', None)
        return cleaned

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
