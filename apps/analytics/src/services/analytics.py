"""Core analytics calculations."""
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config.settings import DROPOUT_THRESHOLD
from src.services.etl import (
    extract_student_features,
    extract_course_stats,
    extract_grade_trend,
    extract_absence_trend,
    _safe,
)
from src.services.ml_model import predict_score, score_to_label

logger = logging.getLogger(__name__)


def calculate_student_metrics(db: Session, enrollment_id: str) -> dict:
    df = extract_student_features(db, enrollment_id)
    if df.empty:
        return _empty_student_metrics(enrollment_id)

    row = df.iloc[0].to_dict()
    att_overall = _safe(row.get("attendance_rate_overall"))
    att_2w      = _safe(row.get("attendance_rate_2w"))
    avg_grade   = _safe(row.get("avg_grade_overall"))

    risk_score = predict_score(row)
    risk_label = score_to_label(risk_score)

    grade_trend  = extract_grade_trend(db, enrollment_id)
    absence_trend = extract_absence_trend(db, enrollment_id)

    return {
        "enrollmentId": enrollment_id,
        "attendance_rate": round(att_overall * 100, 2),
        "attendance_rate_2w": round(att_2w * 100, 2),
        "avg_grade": round(avg_grade * 100, 2),
        "grade_trend": grade_trend,
        "absence_trend": absence_trend,
        "assignments_completion": round(_safe(row.get("assignments_submitted_rate")) * 100, 2),
        "days_since_login": round(_safe(row.get("days_since_login"), 30), 1),
        "dropout_risk_score": risk_score,
        "dropout_risk_label": risk_label,
        "features": {k: round(float(v), 4) if v is not None else 0.0 for k, v in row.items() if k != "enrollment_id"},
    }


def _empty_student_metrics(enrollment_id: str) -> dict:
    return {
        "enrollmentId": enrollment_id,
        "attendance_rate": 0.0,
        "attendance_rate_2w": 0.0,
        "avg_grade": 0.0,
        "grade_trend": [],
        "absence_trend": [],
        "assignments_completion": 0.0,
        "days_since_login": 30.0,
        "dropout_risk_score": 0.0,
        "dropout_risk_label": "low",
        "features": {},
    }


def calculate_course_stats(db: Session, course_id: str) -> dict:
    return extract_course_stats(db, course_id)


def calculate_teacher_kpi(db: Session, teacher_id: str) -> dict:
    row = db.execute(
        text("""
            SELECT
                COUNT(DISTINCT c.id)::int    AS total_courses,
                COUNT(DISTINCT e.id)::int    AS total_students,
                COUNT(DISTINCT e.id) FILTER (WHERE e.dropout_risk_score >= 0.65)::int AS at_risk_count,
                COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'COMPLETED')::float
                    / NULLIF(COUNT(DISTINCT e.id),0) AS completion_rate,
                AVG(
                    CASE WHEN att_s.rate IS NOT NULL THEN att_s.rate ELSE NULL END
                )::float AS avg_att,
                AVG(gr_s.avg_grade)::float  AS avg_grade
            FROM courses c
            LEFT JOIN enrollments e ON e.course_id = c.id
            LEFT JOIN (
                SELECT a.enrollment_id,
                    COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float
                        / NULLIF(COUNT(*),0) AS rate
                FROM attendance a GROUP BY a.enrollment_id
            ) att_s ON att_s.enrollment_id = e.id
            LEFT JOIN (
                SELECT g.enrollment_id,
                    AVG(g.score / NULLIF(ast.max_score,0)) AS avg_grade
                FROM grades g JOIN assessments ast ON ast.id = g.assessment_id
                GROUP BY g.enrollment_id
            ) gr_s ON gr_s.enrollment_id = e.id
            WHERE c.teacher_id = :tid
        """),
        {"tid": teacher_id},
    ).fetchone()

    return {
        "teacherId": teacher_id,
        "total_courses": row.total_courses or 0,
        "total_students": row.total_students or 0,
        "avg_attendance_rate": round(_safe(row.avg_att) * 100, 2),
        "avg_grade": round(_safe(row.avg_grade) * 100, 2),
        "course_completion_rate": round(_safe(row.completion_rate) * 100, 2),
        "at_risk_students_count": row.at_risk_count or 0,
    }


def get_high_risk_students(
    db: Session,
    threshold: float = DROPOUT_THRESHOLD,
    course_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    course_filter = "AND e.course_id = :course_id" if course_id else ""
    params: dict = {"threshold": threshold, "limit": limit, "offset": offset}
    if course_id:
        params["course_id"] = course_id

    rows = db.execute(
        text(f"""
            SELECT
                e.id AS enrollment_id,
                e.student_id,
                e.course_id,
                e.dropout_risk_score,
                u.email,
                u.first_name,
                u.last_name,
                u.last_login_at,
                c.title AS course_title,
                att_s.rate AS att_rate
            FROM enrollments e
            JOIN users u ON u.id = e.student_id
            JOIN courses c ON c.id = e.course_id
            LEFT JOIN (
                SELECT a.enrollment_id,
                    COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float
                        / NULLIF(COUNT(*),0) AS rate
                FROM attendance a GROUP BY a.enrollment_id
            ) att_s ON att_s.enrollment_id = e.id
            WHERE e.status = 'ACTIVE'
              AND e.dropout_risk_score >= :threshold
              {course_filter}
            ORDER BY e.dropout_risk_score DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    total = db.execute(
        text(f"""
            SELECT COUNT(*)::int FROM enrollments e
            WHERE e.status = 'ACTIVE'
              AND e.dropout_risk_score >= :threshold
              {course_filter}
        """),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    ).scalar()

    return {
        "total": total or 0,
        "data": [
            {
                "enrollmentId": str(r.enrollment_id),
                "studentId": str(r.student_id),
                "courseId": str(r.course_id),
                "riskScore": _safe(r.dropout_risk_score),
                "student": {
                    "email": r.email,
                    "firstName": r.first_name,
                    "lastName": r.last_name,
                    "lastLoginAt": r.last_login_at.isoformat() if r.last_login_at else None,
                },
                "courseTitle": r.course_title,
                "attendanceRate": round(_safe(r.att_rate) * 100, 1),
            }
            for r in rows
        ],
    }
