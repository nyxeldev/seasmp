import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.settings import CORS_ORIGINS, LOG_LEVEL
from src.services.ml_model import load_model
from src.config.database import engine
from src.db.schema_contract import assert_schema_contract
from src.routes.health import router as health_router
from src.routes.students import router as students_router
from src.routes.courses import router as courses_router
from src.routes.predictions import router as predictions_router

# Legacy routes kept for backward compatibility
from src.routes.analytics import router as legacy_analytics_router

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Prisma (apps/api) boshqaradigan jadvallar bilan mos kelishini
    # tekshiradi — mos kelmasa xizmat ko'tarilmaydi, ETL/prediction
    # so'rovlari runtime'da noaniq SQL xatosi bilan yiqilishi o'rniga.
    assert_schema_contract(engine)
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
#
# legacy_dropout_router (/dropout/*, src/routes/dropout.py +
# src/services/dropout_service.py) was removed during the DB fix phase: it
# trained/scored enrollments.dropout_risk_score with a second, different
# feature set and model file (LEGACY_MODEL_PATH), had no auth dependency at
# all (unlike every other router here), and — confirmed by a repo-wide
# search across apps/api, apps/web, tests, and CI — nothing in the current
# product called it. The canonical pipeline is src/services/etl.py +
# src/services/ml_model.py, triggered via /v1/analytics/trigger-calculation.
app.include_router(legacy_analytics_router)
