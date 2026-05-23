from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.config.database import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/students/{student_id}")
def student_analytics(student_id: str, db: Session = Depends(get_db)):
    result = db.execute(
        text("""
            SELECT
                e.id              AS enrollment_id,
                e.course_id,
                c.title           AS course_title,
                e.status,
                e.dropout_risk_score,
                COUNT(a.id) FILTER (WHERE a.status = 'PRESENT')::int  AS present_count,
                COUNT(a.id) FILTER (WHERE a.status = 'ABSENT')::int   AS absent_count,
                COUNT(a.id) FILTER (WHERE a.status = 'LATE')::int     AS late_count,
                COUNT(a.id)::int                                       AS total_sessions,
                AVG(g.score / NULLIF(ast.max_score, 0))::float        AS avg_grade,
                COUNT(g.id)::int                                       AS submission_count
            FROM enrollments e
            JOIN courses c ON c.id = e.course_id
            LEFT JOIN attendance a ON a.enrollment_id = e.id
            LEFT JOIN grades g ON g.enrollment_id = e.id
            LEFT JOIN assessments ast ON ast.id = g.assessment_id
            WHERE e.student_id = :student_id
            GROUP BY e.id, e.course_id, c.title, e.status, e.dropout_risk_score
            ORDER BY e.enrolled_at DESC
        """),
        {"student_id": student_id},
    )
    rows = result.fetchall()

    if not rows:
        user_check = db.execute(
            text("SELECT id FROM users WHERE id = :id AND role = 'STUDENT'"),
            {"id": student_id},
        ).fetchone()
        if user_check is None:
            raise HTTPException(status_code=404, detail="Student not found")

    enrollments = []
    for r in rows:
        total = r.total_sessions or 0
        present = r.present_count or 0
        enrollments.append({
            "enrollmentId": str(r.enrollment_id),
            "courseId": str(r.course_id),
            "courseTitle": r.course_title,
            "status": r.status,
            "dropoutRiskScore": float(r.dropout_risk_score) if r.dropout_risk_score is not None else None,
            "attendance": {
                "present": present,
                "absent": r.absent_count or 0,
                "late": r.late_count or 0,
                "total": total,
                "rate": round(present / total, 4) if total > 0 else 0.0,
            },
            "grades": {
                "average": round(float(r.avg_grade), 4) if r.avg_grade is not None else None,
                "submissionCount": r.submission_count or 0,
            },
        })

    return {"studentId": student_id, "enrollments": enrollments}


@router.get("/courses/{course_id}")
def course_analytics(course_id: str, db: Session = Depends(get_db)):
    course = db.execute(
        text("SELECT id, title FROM courses WHERE id = :id"),
        {"id": course_id},
    ).fetchone()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    stats = db.execute(
        text("""
            SELECT
                COUNT(e.id)::int                                                              AS total_enrollments,
                COUNT(e.id) FILTER (WHERE e.status = 'ACTIVE')::int                          AS active,
                COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED')::int                       AS completed,
                COUNT(e.id) FILTER (WHERE e.status = 'DROPPED')::int                         AS dropped,
                AVG(e.dropout_risk_score)::float                                              AS avg_risk,
                COUNT(e.id) FILTER (WHERE e.dropout_risk_score >= 0.65)::int                  AS high_risk_count,
                AVG(g.score / NULLIF(ast.max_score, 0))::float                               AS avg_grade,
                COUNT(a.id) FILTER (WHERE a.status = 'PRESENT')::float
                    / NULLIF(COUNT(a.id), 0)                                                  AS att_rate
            FROM enrollments e
            LEFT JOIN grades g ON g.enrollment_id = e.id
            LEFT JOIN assessments ast ON ast.id = g.assessment_id
            LEFT JOIN attendance a ON a.enrollment_id = e.id
            WHERE e.course_id = :course_id
        """),
        {"course_id": course_id},
    ).fetchone()

    assessments = db.execute(
        text("""
            SELECT
                ast.id, ast.title, ast.type, ast.max_score,
                COUNT(g.id)::int AS submission_count,
                AVG(g.score)::float AS avg_score,
                MIN(g.score)::float AS min_score,
                MAX(g.score)::float AS max_score_achieved
            FROM assessments ast
            LEFT JOIN grades g ON g.assessment_id = ast.id
            WHERE ast.course_id = :course_id
            GROUP BY ast.id, ast.title, ast.type, ast.max_score
            ORDER BY ast.created_at
        """),
        {"course_id": course_id},
    ).fetchall()

    return {
        "courseId": course_id,
        "courseTitle": course.title,
        "enrollment": {
            "total": stats.total_enrollments or 0,
            "active": stats.active or 0,
            "completed": stats.completed or 0,
            "dropped": stats.dropped or 0,
        },
        "dropoutRisk": {
            "average": round(float(stats.avg_risk), 4) if stats.avg_risk is not None else None,
            "highRiskCount": stats.high_risk_count or 0,
        },
        "grades": {
            "average": round(float(stats.avg_grade), 4) if stats.avg_grade is not None else None,
        },
        "attendance": {
            "rate": round(float(stats.att_rate), 4) if stats.att_rate is not None else None,
        },
        "assessments": [
            {
                "id": str(a.id),
                "title": a.title,
                "type": a.type,
                "maxScore": float(a.max_score),
                "submissionCount": a.submission_count,
                "avgScore": round(float(a.avg_score), 4) if a.avg_score is not None else None,
                "minScore": float(a.min_score) if a.min_score is not None else None,
                "maxScoreAchieved": float(a.max_score_achieved) if a.max_score_achieved is not None else None,
            }
            for a in assessments
        ],
    }
