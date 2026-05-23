import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.settings import CORS_ORIGINS, LOG_LEVEL
from src.services.ml_model import load_model
from src.routes.health import router as health_router
from src.routes.students import router as students_router
from src.routes.courses import router as courses_router
from src.routes.predictions import router as predictions_router

# Legacy routes kept for backward compatibility
from src.routes.analytics import router as legacy_analytics_router
from src.routes.dropout import router as legacy_dropout_router

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


app = FastAPI(
    title="SEASMP Analytics",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# v1 prefix routes (new)
app.include_router(health_router)
app.include_router(students_router, prefix="/v1")
app.include_router(courses_router, prefix="/v1")
app.include_router(predictions_router, prefix="/v1")

# Legacy routes (no prefix, backward compat for existing Node.js calls)
app.include_router(legacy_analytics_router)
app.include_router(legacy_dropout_router)
