from celery import Celery
from celery.schedules import crontab
from src.config.settings import REDIS_URL

celery = Celery("analytics", broker=REDIS_URL, backend=REDIS_URL)

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
    },
    include=[
        "src.tasks.etl_tasks",
        "src.tasks.training_tasks",
    ],
)
