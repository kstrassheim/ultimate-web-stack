from fastapi import FastAPI, APIRouter, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
#for health check
import psutil
import datetime
# for Application Insights
from opencensus.ext.azure.trace_exporter import AzureExporter
from opencensus.ext.fastapi.fastapi_middleware import FastAPIMiddleware
from opencensus.trace.samplers import ProbabilitySampler

# load environment variables
from dotenv import load_dotenv
load_dotenv()
# get routers
from api import api_router


# Init FastAPI
app = FastAPI()

from common import azure_scheme, tfconfig, logger
# Only add custom CORS origins if in development
origins = ["http://localhost:5173", "localhost:5173"] if tfconfig["env"]["value"] == "dev" else []
app.add_middleware(CORSMiddleware,allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Application Insights
# Set up the Azure exporter with your Full insigthts connection string
azure_exporter = AzureExporter(connection_string=tfconfig['application_insights_connection_string']['value'])

# Add OpenCensus middleware to capture request telemetry
app.add_middleware(
    FastAPIMiddleware,
    exporter=azure_exporter,
    sampler=ProbabilitySampler(1.0),  # Adjust sampling rate as needed
)

# Register API Router
app.include_router(api_router, prefix="/api")

@app.get("/health")
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
    return FileResponse(fp)
app.include_router(frontend_router, prefix="")




# On startup, load the OpenID configuration (optional but recommended)
# I get 401 with that
# from common import azure_scheme
# @app.on_event("startup")
# async def startup_event():
#     await azure_scheme.openid_config.load_config()

# Bootstrap the app
if __name__ == '__main__':
    uvicorn.run('main:app', reload=True)