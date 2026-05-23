from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.config.database import get_db
from src.routes.auth import require_internal_key
from src.services.analytics import get_high_risk_students, calculate_teacher_kpi
from src.services.cache import cache_get, cache_set, RISK_TTL, TEACHER_TTL
from src.config.settings import DROPOUT_THRESHOLD

router = APIRouter(tags=["predictions"], dependencies=[Depends(require_internal_key)])


@router.get("/dropout-risk")
def dropout_risk(
    threshold: float = Query(default=DROPOUT_THRESHOLD, ge=0.0, le=1.0),
    course_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    cache_key = f"analytics:dropout-risk:{threshold}:{course_id}:{limit}:{offset}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    data = get_high_risk_students(db, threshold=threshold, course_id=course_id, limit=limit, offset=offset)
    cache_set(cache_key, data, RISK_TTL)
    return data


@router.get("/teachers/{teacher_id}/kpi")
def teacher_kpi(teacher_id: str, db: Session = Depends(get_db)):
    teacher = db.execute(
        text("SELECT id FROM users WHERE id = :id AND role = 'TEACHER'"), {"id": teacher_id}
    ).fetchone()
    if teacher is None:
        raise HTTPException(status_code=404, detail="Teacher not found")

    cache_key = f"analytics:teacher:{teacher_id}:kpi"
    cached = cache_get(cache_key)
    if cached:
        return cached

    data = calculate_teacher_kpi(db, teacher_id)
    cache_set(cache_key, data, TEACHER_TTL)
    return data


@router.post("/analytics/trigger-calculation")
def trigger_calculation(db: Session = Depends(get_db)):
    """Manually trigger nightly ETL (admin use)."""
    from src.tasks.etl_tasks import nightly_risk_calculation
    task = nightly_risk_calculation.delay()
    return {"status": "queued", "taskId": str(task.id)}
