import threading
import logging
from common.config import tfconfig, mock_enabled
from opencensus.ext.azure.log_exporter import AzureLogHandler
from opencensus.ext.azure.trace_exporter import AzureExporter

class MockAzureLogHandler(logging.StreamHandler):
    """Mock handler that outputs to console instead of Azure"""
    def __init__(self, connection_string=None):
        super().__init__()
        self.setFormatter(logging.Formatter('[MOCK AZURE LOG] %(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        print("Using MockAzureLogHandler instead of sending to Application Insights")

class MockAzureExporter:
    """Mock exporter that doesn't send data to Azure"""
    def __init__(self, connection_string=None):
        print("Using MockAzureExporter instead of sending to Application Insights")
    
    def export(self, *args, **kwargs):
        pass

def create_fixed_logger():
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    
    # Fix existing handlers
    for handler in logger.handlers:
        if handler.lock is None:
            handler.lock = threading.RLock()
    
    # Remove any existing Azure handlers
    for handler in list(logger.handlers):
        if isinstance(handler, AzureLogHandler) or isinstance(handler, MockAzureLogHandler):
            logger.removeHandler(handler)
    
    # Add appropriate handler based on mock setting
    if mock_enabled:
        mock_handler = MockAzureLogHandler()
        mock_handler.lock = threading.RLock()
        logger.addHandler(mock_handler)
    else:
        azure_handler = AzureLogHandler(connection_string=tfconfig['application_insights_connection_string']['value'])
        azure_handler.lock = threading.RLock()
        logger.addHandler(azure_handler)
    
    # Always add a console handler for local debugging
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    console_handler.lock = threading.RLock()
    logger.addHandler(console_handler)
    
    return logger

# Create logger
logger = create_fixed_logger()

# Application Insights exporter
log_azure_exporter = MockAzureExporter() if mock_enabled else AzureExporter(
    connection_string=tfconfig['application_insights_connection_string']['value']
)
