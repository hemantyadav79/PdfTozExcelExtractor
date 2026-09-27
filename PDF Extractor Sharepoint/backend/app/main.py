# Bootstrap PyTorch/EasyOCR DLL loading on Windows before other imports
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
try:
    import torch
except Exception:
    pass

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database.connection import init_db
from app.services.queue import start_queue_worker, stop_queue_worker
from app.api.endpoints import auth, documents, extract, export, settings as settings_endpoints

# Configure logging style
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Events
    logger.info("Initializing database schemas...")
    init_db()
    
    logger.info("Starting background execution queues...")
    start_queue_worker()
    
    yield
    
    # Shutdown Events
    logger.info("Stopping background queue threads...")
    stop_queue_worker()
    logger.info("System successfully shut down.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    version="1.0.0"
)

# Set CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route registrations
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(extract.router, prefix=f"{settings.API_V1_STR}/extract", tags=["Extraction"])
app.include_router(export.router, prefix=f"{settings.API_V1_STR}/export", tags=["Export"])
app.include_router(settings_endpoints.router, prefix=f"{settings.API_V1_STR}/settings", tags=["Settings"])

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "docs_url": "/docs"
    }
