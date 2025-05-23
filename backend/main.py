from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
#for health check
import psutil
import datetime
# for Application Insights
from opencensus.ext.fastapi.fastapi_middleware import FastAPIMiddleware
from opencensus.trace.samplers import ProbabilitySampler

# load environment variables
from os import environ as os_environ
from dotenv import load_dotenv
load_dotenv()
# get routers
from api.api import api_router
from api.future_gadget_api import future_gadget_api_router
# Check MOCK environment variable
mock_enabled = os_environ.get("MOCK", "false").lower() == "true"
# Init FastAPI
app = FastAPI()

from common.config import origins
from common.log import log_azure_exporter

# Only add custom CORS origins if in development
app.add_middleware(CORSMiddleware,allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Add OpenCensus middleware to capture request telemetry
app.add_middleware( FastAPIMiddleware,  exporter=log_azure_exporter, sampler=ProbabilitySampler(1.0))

# Register API Router
app.include_router(api_router, prefix="/api")

# Register Future gadget Router
app.include_router(future_gadget_api_router, prefix="/future-gadget-lab")

# Generate test data for Future Gadget Lab
from db.future_gadget_lab_data_service import generate_test_data
from api.future_gadget_api import fgl_service

# Only generate test data if the database is empty
if not fgl_service.get_all_experiments() and not fgl_service.get_all_divergence_readings():
    test_data = generate_test_data(fgl_service)
    print("=== Generated Future Gadget Lab Test Data ===")
    print(f"Created {len(test_data['experiments'])} experiments")
    print(f"Created {len(test_data['divergence_readings'])} divergence readings")
    print("===========================================")

@app.get("/health")
@app.head("/health") 
async def health():
    # Calculate uptime from system boot time
    boot_time = datetime.datetime.fromtimestamp(psutil.boot_time())
    uptime = datetime.datetime.now() - boot_time
    # Gather CPU and memory metrics
    cpu_percent = psutil.cpu_percent(interval=1)
    memory_info = psutil.virtual_memory()
    return {"status": "ok","uptime": str(uptime),"cpu_percent": cpu_percent,"memory": {"total": memory_info.total,"available": memory_info.available,"percent": memory_info.percent,"used": memory_info.used,"free": memory_info.free,}}


# Frontend Router
dist = Path("./dist")
frontend_router = APIRouter()
@frontend_router.get('/{path:path}')
async def frontend_handler(path: str):

    # Exclude API paths - prevent serving HTML for API routes
    if path.startswith('api/') or path.startswith('future-gadget-lab/'):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="API path not found")
    

    fp = dist / path
    if path == '' or not fp.exists():
        fp = dist / "index.html"

        # Set correct MIME types for JavaScript modules
    media_type = None
    if path.endswith('.js'):
        media_type = "application/javascript"
    elif path.endswith('.css'):
        media_type = "text/css"
    elif path.endswith('.html'):
        media_type = "text/html"
    elif path.endswith('.json'):
        media_type = "application/json"
    
    # Pass the media_type to FileResponse
    return FileResponse(fp, media_type=media_type)

    return FileResponse(fp)
app.include_router(frontend_router, prefix="")



# Bootstrap the app
if __name__ == '__main__':
    uvicorn.run('main:app', reload=True)