from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.config.database import get_db
from src.routes.auth import require_internal_key
from src.services.analytics import calculate_course_stats
from src.services.cache import cache_get, cache_set, COURSE_TTL

router = APIRouter(prefix="/courses", tags=["courses"], dependencies=[Depends(require_internal_key)])


@router.get("/{course_id}/analytics")
def course_analytics(course_id: str, db: Session = Depends(get_db)):
    course = db.execute(
        text("SELECT id FROM courses WHERE id = :id"), {"id": course_id}
    ).fetchone()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    cache_key = f"analytics:course:{course_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    data = calculate_course_stats(db, course_id)
    cache_set(cache_key, data, COURSE_TTL)
    return data
