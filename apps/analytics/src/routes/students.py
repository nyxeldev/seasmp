from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.routes.auth import require_internal_key
from src.services.analytics import calculate_student_metrics
from src.services.cache import cache_get, cache_set, STUDENT_TTL

router = APIRouter(prefix="/students", tags=["students"], dependencies=[Depends(require_internal_key)])


@router.get("/{enrollment_id}/analytics")
def student_analytics(enrollment_id: str, db: Session = Depends(get_db)):
    cache_key = f"analytics:student:{enrollment_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    data = calculate_student_metrics(db, enrollment_id)
    cache_set(cache_key, data, STUDENT_TTL)
    return data
