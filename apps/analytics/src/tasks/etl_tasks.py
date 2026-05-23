"""Scheduled ETL and risk scoring tasks."""
import logging
import httpx

from src.tasks.celery_app import celery
from src.config.settings import API_NODE_URL, INTERNAL_API_KEY

logger = logging.getLogger(__name__)


@celery.task(name="tasks.etl_tasks.nightly_risk_calculation", bind=True, max_retries=3)
def nightly_risk_calculation(self):
    """Runs nightly at 02:00 Asia/Tashkent — scores all active enrollments."""
    from src.config.database import SessionLocal
    from src.services.etl import extract_all_active_students
    from src.services.ml_model import predict_score, score_to_label
    from sqlalchemy import text

    db = SessionLocal()
    try:
        df = extract_all_active_students(db)
        total = len(df)
        logger.info("nightly_risk_calculation: %d active enrollments", total)

        scored = 0
        high_risk = []
        for _, row in df.iterrows():
            try:
                features = row.to_dict()
                score = predict_score(features)
                label = score_to_label(score)

                db.execute(
                    text("UPDATE enrollments SET dropout_risk_score = :score WHERE id = :id"),
                    {"score": score, "id": row["enrollment_id"]},
                )
                scored += 1

                if label == "high":
                    high_risk.append({
                        "enrollmentId": row["enrollment_id"],
                        "studentId": row.get("student_id", ""),
                        "riskScore": score,
                    })
            except Exception as exc:
                logger.warning("Scoring failed for %s: %s", row.get("enrollment_id"), exc)

        db.commit()
        logger.info("nightly_risk_calculation done: %d/%d scored, %d high-risk", scored, total, len(high_risk))

        # Notify Node.js API about high-risk students
        if high_risk:
            _notify_high_risk(high_risk)

        return {"scored": scored, "total": total, "high_risk_count": len(high_risk)}

    except Exception as exc:
        db.rollback()
        logger.error("nightly_risk_calculation failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)
    finally:
        db.close()


def _notify_high_risk(high_risk: list[dict]) -> None:
    try:
        with httpx.Client(timeout=10) as client:
            client.post(
                f"{API_NODE_URL}/v1/internal/notifications",
                json={"type": "high_dropout_risk", "data": high_risk},
                headers={"X-Internal-Key": INTERNAL_API_KEY},
            )
    except Exception as exc:
        logger.warning("Failed to notify API about high-risk students: %s", exc)


@celery.task(name="tasks.etl_tasks.daily_analytics_cache", bind=True, max_retries=2)
def daily_analytics_cache(self):
    """Runs daily at 06:00 — pre-computes and caches course analytics."""
    from src.config.database import SessionLocal
    from src.services.analytics import calculate_course_stats
    from src.services.cache import cache_set, COURSE_TTL
    from sqlalchemy import text

    db = SessionLocal()
    try:
        course_ids = [
            str(r.id)
            for r in db.execute(
                text("SELECT id FROM courses WHERE status = 'ACTIVE'")
            ).fetchall()
        ]
        logger.info("daily_analytics_cache: caching %d active courses", len(course_ids))

        cached = 0
        for cid in course_ids:
            try:
                stats = calculate_course_stats(db, cid)
                cache_set(f"analytics:course:{cid}", stats, COURSE_TTL)
                cached += 1
            except Exception as exc:
                logger.warning("Failed to cache course %s: %s", cid, exc)

        logger.info("daily_analytics_cache done: %d/%d cached", cached, len(course_ids))
        return {"cached": cached, "total": len(course_ids)}

    except Exception as exc:
        logger.error("daily_analytics_cache failed: %s", exc)
        raise self.retry(exc=exc, countdown=600)
    finally:
        db.close()
