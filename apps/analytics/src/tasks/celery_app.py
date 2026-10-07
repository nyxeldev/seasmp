import logging

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init
from src.config.settings import REDIS_URL

logger = logging.getLogger(__name__)

celery = Celery("analytics", broker=REDIS_URL, backend=REDIS_URL)


@worker_process_init.connect
def _check_schema_contract(**kwargs):
    # Har bir worker jarayoni boshlanganda — nightly-risk, daily-cache va
    # monthly-retrain vazifalari Prisma sxemasi bilan mos kelmagan holda
    # soatlab jim ishlab, keyin tushunarsiz SQL xatosi bilan yiqilmasligi
    # uchun. Xato bo'lsa worker umuman ko'tarilmaydi.
    from src.config.database import engine
    from src.db.schema_contract import assert_schema_contract
    assert_schema_contract(engine)


@worker_process_init.connect
def _load_dropout_model(**kwargs):
    # DB fix phase (H1): main.py'ning FastAPI lifespan'i ishga tushganda
    # load_model()'ni chaqiradi, lekin Celery worker buni HECH QACHON
    # qilmagan — ml_model._model har doim None bo'lib qolardi, shuning
    # uchun nightly_risk_calculation haqiqatda o'qitilgan model mavjud
    # bo'lsa ham doim qoida-asosli fallback'ni ishlatardi (ml/models/
    # *.pkl diskda bor-yo'qligidan qat'i nazar). Har bir fork qilingan
    # worker jarayoni o'zining nusxasini xotiraga yuklashi kerak — xuddi
    # schema_contract tekshiruvi kabi, process_init signalida.
    from src.services.ml_model import load_model
    load_model()

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Tashkent",
    enable_utc=False,
    beat_schedule={
        "nightly-risk": {
            "task": "tasks.etl_tasks.nightly_risk_calculation",
            "schedule": crontab(hour=2, minute=0),
        },
        "daily-cache": {
            "task": "tasks.etl_tasks.daily_analytics_cache",
            "schedule": crontab(hour=6, minute=0),
        },
        "monthly-retrain": {
            "task": "tasks.training_tasks.monthly_model_retrain",
            "schedule": crontab(day_of_month=1, hour=3, minute=0),
        },
        # DB fix phase, H2 — audit_logs/refresh_tokens/ip_blocks hech qachon
        # tozalanmasdi. 04:00 — nightly-risk (02:00) va daily-cache (06:00)
        # orasida, ularga zid kelmaydi.
        "retention-cleanup": {
            "task": "tasks.retention_tasks.cleanup_expired_data",
            "schedule": crontab(hour=4, minute=0),
        },
    },
    # `ml.train` task modullarida emas, lekin shu yerda ro'yxatda bo'lishi
    # SHART: Celery `-A`/`include` ro'yxatini joriy ish katalogi (cwd) vaqtincha
    # sys.path'da turgan paytda (worker fork'lanishidan OLDIN) import qiladi.
    # `src.*` modullar aynan shu mexanizm orqali ishlaydi va shu sababdan
    # keyinroq (worker_process_init, task ichida) muammosiz import qilinadi.
    # `ml.train` bu ro'yxatda bo'lmasa, uni keyinroq, cwd endi sys.path'da
    # YO'Q paytda import qilishga urinish "No module named 'ml'" bilan
    # yiqilardi — aynan shu narsa ml_model.load_model()'da yuz berardi.
    include=[
        "src.tasks.etl_tasks",
        "src.tasks.training_tasks",
        "src.tasks.retention_tasks",
        "ml.train",
    ],
)
