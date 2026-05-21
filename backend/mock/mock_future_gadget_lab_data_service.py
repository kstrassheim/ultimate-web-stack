"""Mock implementation of the Future Gadget Lab data service using in-memory TinyDB storage."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, Union

from tinydb import TinyDB
from tinydb.storages import MemoryStorage

from common.log import logger
from db.future_gadget_lab_data_service import FutureGadgetLabDataService, _DEFAULT_PARTITION_KEY_PATH


class MockFutureGadgetLabDataService(FutureGadgetLabDataService):
    """In-memory mock data service for local development and testing."""

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        cosmos_account_uri: Optional[str] = None,
        cosmos_database: Optional[str] = None,
        cosmos_container: Optional[str] = None,
        cosmos_partition_key: str = _DEFAULT_PARTITION_KEY_PATH,
        credential: Optional[Any] = None,
    ) -> None:
        super().__init__(
            db_path=db_path,
            cosmos_account_uri=cosmos_account_uri,
            cosmos_database=cosmos_database,
            cosmos_container=cosmos_container,
            cosmos_partition_key=cosmos_partition_key,
            credential=credential,
        )

    def _initialize_db(self) -> None:  # type: ignore[override]
        logger.info("Using in-memory TinyDB storage for MockFutureGadgetLabDataService")
        self.storage_backend = "tinydb"
        self.db = TinyDB(storage=MemoryStorage)  # type: ignore[assignment]
        self._initialize_tinydb_tables()
        self._seed_dev_phase_shift_experiment()

    def _seed_dev_phase_shift_experiment(self) -> None:
        """Seed a 'phase-shift' status experiment for dev runtime bug validation."""
        import datetime

        phase_shift_exp = {
            "name": "Phase Shift Validation Test",
            "description": "Artificial experiment with phase-shift status for bug validation",
            "status": "phase-shift",
            "creator_id": "Tester",
            "collaborators": [],
            "results": "Bug validation experiment",
            "world_line_change": 0.0,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%S.%f"
            )[:-3] + "Z"
        }
        self.experiments_table.insert(phase_shift_exp)  # type: ignore[union-attr]
