from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from src.config.database import get_db
from src.services import dropout_service

router = APIRouter(prefix="/dropout", tags=["dropout"])


@router.get("/risk/{enrollment_id}")
def get_risk(enrollment_id: str, db: Session = Depends(get_db)):
    result = dropout_service.predict_single(db, enrollment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return result


@router.get("/batch/{course_id}")
def batch_predict(course_id: str, db: Session = Depends(get_db)):
    results = dropout_service.predict_batch(db, course_id)
    return {"courseId": course_id, "count": len(results), "data": results}


@router.get("/high-risk")
def high_risk(
    threshold: float = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    results = dropout_service.get_high_risk(db, threshold=threshold, limit=limit)
    return {"count": len(results), "data": results}


@router.post("/train")
def train(db: Session = Depends(get_db)):
    result = dropout_service.train_model(db)
    return result
