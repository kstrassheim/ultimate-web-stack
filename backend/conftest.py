import sys
import os
import pytest

# Set MOCK=true globally for all tests before any modules are imported
os.environ["MOCK"] = "true"

# Add the project root directory to Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))