"""Model retraining tasks."""
import logging

from src.tasks.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="tasks.training_tasks.monthly_model_retrain", bind=True, max_retries=2)
def monthly_model_retrain(self):
    """Runs on the 1st of each month at 03:00 — retrains the dropout model."""
    import os
    from src.config.database import SessionLocal
    from src.config.settings import MODEL_PATH
    from src.services.ml_model import load_model, get_model, predict_score
    from ml.train import train_model, get_model_metadata
    import joblib
    import numpy as np

    db = SessionLocal()
    try:
        old_meta = get_model_metadata()
        old_auc  = old_meta.get("auc_roc", 0.0) if old_meta else 0.0

        logger.info("monthly_model_retrain: starting, old AUC=%.4f", old_auc)
        result = train_model(db)

        if result["status"] == "success":
            new_auc = result.get("auc_roc", 0.0)
            logger.info(
                "monthly_model_retrain: new AUC=%.4f vs old=%.4f — %s",
                new_auc, old_auc,
                "IMPROVED" if new_auc >= old_auc else "DEGRADED (kept new anyway)"
            )
            # Reload model in-process
            load_model()
        else:
            logger.warning("monthly_model_retrain skipped: %s", result.get("reason"))

        return result

    except Exception as exc:
        logger.error("monthly_model_retrain failed: %s", exc)
        raise self.retry(exc=exc, countdown=1800)
    finally:
        db.close()
