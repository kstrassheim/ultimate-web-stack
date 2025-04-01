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
from api import api_router
# Check MOCK environment variable
mock_enabled = os_environ.get("MOCK", "false").lower() == "true"
# Init FastAPI
app = FastAPI()

from common import origins, log_azure_exporter

# Only add custom CORS origins if in development
app.add_middleware(CORSMiddleware,allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Add OpenCensus middleware to capture request telemetry
app.add_middleware( FastAPIMiddleware,  exporter=log_azure_exporter, sampler=ProbabilitySampler(1.0))

# Register API Router
app.include_router(api_router, prefix="/api")

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