"""ETL pipeline: PostgreSQL → pandas DataFrame."""
import logging
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ─── Feature SQL ──────────────────────────────────────────────────────────────

_STUDENT_FEATURE_SQL = text("""
WITH att AS (
    SELECT
        a.enrollment_id,
        COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float AS present_count,
        COUNT(*)::float                                                AS total_sessions,
        COUNT(*) FILTER (
            WHERE a.status IN ('PRESENT','LATE')
              AND a.lesson_date >= CURRENT_DATE - INTERVAL '14 days'
        )::float AS present_2w,
        COUNT(*) FILTER (
            WHERE a.lesson_date >= CURRENT_DATE - INTERVAL '14 days'
        )::float AS total_2w,
        COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent_count
    FROM attendance a
    GROUP BY a.enrollment_id
),
gr AS (
    SELECT
        g.enrollment_id,
        AVG(g.score / NULLIF(ast.max_score, 0))::float    AS avg_grade_overall,
        COUNT(*) FILTER (WHERE ast.type = 'HOMEWORK')::int AS homework_total,
        COUNT(*) FILTER (
            WHERE ast.type = 'HOMEWORK' AND g.graded_at IS NOT NULL
        )::int AS homework_submitted,
        COUNT(*) FILTER (
            WHERE ast.due_date IS NOT NULL AND g.graded_at > ast.due_date
        )::int AS late_submissions
    FROM grades g
    JOIN assessments ast ON ast.id = g.assessment_id
    WHERE g.enrollment_id = :enrollment_id
    GROUP BY g.enrollment_id
)
SELECT
    e.id                                                        AS enrollment_id,
    e.student_id,
    e.course_id,
    e.status,
    e.dropout_risk_score,
    e.enrolled_at,
    COALESCE(att.present_count, 0) / NULLIF(att.total_sessions, 0) AS attendance_rate_overall,
    COALESCE(att.present_2w, 0) / NULLIF(att.total_2w, 0)          AS attendance_rate_2w,
    COALESCE(att.absent_count, 0)::int                              AS absent_count,
    COALESCE(gr.avg_grade_overall, 0)                               AS avg_grade_overall,
    COALESCE(
        (SELECT AVG(sub.pct) FROM (
            SELECT (g2.score / NULLIF(a2.max_score, 0)) AS pct
            FROM grades g2
            JOIN assessments a2 ON a2.id = g2.assessment_id
            WHERE g2.enrollment_id = e.id
            ORDER BY g2.graded_at DESC
            LIMIT 3
        ) sub),
        gr.avg_grade_overall, 0
    ) AS avg_grade_last3,
    COALESCE(gr.homework_submitted, 0)::float
        / NULLIF(gr.homework_total, 0)                              AS assignments_submitted_rate,
    COALESCE(gr.late_submissions, 0)::int                           AS late_submissions_count,
    EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400.0         AS days_since_login,
    EXTRACT(EPOCH FROM (NOW() - e.enrolled_at)) / 604800.0          AS course_week_number
FROM enrollments e
JOIN users u ON u.id = e.student_id
LEFT JOIN att ON att.enrollment_id = e.id
LEFT JOIN gr  ON gr.enrollment_id  = e.id
WHERE e.id = :enrollment_id
""")

_BATCH_FEATURE_SQL = text("""
WITH att AS (
    SELECT
        a.enrollment_id,
        COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float AS present_count,
        COUNT(*)::float                                                AS total_sessions,
        COUNT(*) FILTER (
            WHERE a.status IN ('PRESENT','LATE')
              AND a.lesson_date >= CURRENT_DATE - INTERVAL '14 days'
        )::float AS present_2w,
        COUNT(*) FILTER (
            WHERE a.lesson_date >= CURRENT_DATE - INTERVAL '14 days'
        )::float AS total_2w,
        COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent_count
    FROM attendance a
    GROUP BY a.enrollment_id
),
gr AS (
    SELECT
        g.enrollment_id,
        AVG(g.score / NULLIF(ast.max_score, 0))::float   AS avg_grade_overall,
        COUNT(*) FILTER (WHERE ast.type = 'HOMEWORK')::int AS homework_total,
        COUNT(*) FILTER (
            WHERE ast.type = 'HOMEWORK' AND g.graded_at IS NOT NULL
        )::int AS homework_submitted,
        COUNT(*) FILTER (
            WHERE ast.due_date IS NOT NULL AND g.graded_at > ast.due_date
        )::int AS late_submissions
    FROM grades g
    JOIN assessments ast ON ast.id = g.assessment_id
    GROUP BY g.enrollment_id
)
SELECT
    e.id          AS enrollment_id,
    e.student_id,
    e.course_id,
    e.status,
    e.dropout_risk_score,
    COALESCE(att.present_count, 0) / NULLIF(att.total_sessions, 0)  AS attendance_rate_overall,
    COALESCE(att.present_2w, 0) / NULLIF(att.total_2w, 0)           AS attendance_rate_2w,
    COALESCE(att.absent_count, 0)::int                               AS absent_count,
    COALESCE(gr.avg_grade_overall, 0)                                AS avg_grade_overall,
    COALESCE(gr.avg_grade_overall, 0)                                AS avg_grade_last3,
    COALESCE(gr.homework_submitted, 0)::float
        / NULLIF(gr.homework_total, 0)                               AS assignments_submitted_rate,
    COALESCE(gr.late_submissions, 0)::int                            AS late_submissions_count,
    EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400.0          AS days_since_login,
    EXTRACT(EPOCH FROM (NOW() - e.enrolled_at)) / 604800.0           AS course_week_number
FROM enrollments e
JOIN users u ON u.id = e.student_id
LEFT JOIN att ON att.enrollment_id = e.id
LEFT JOIN gr  ON gr.enrollment_id  = e.id
WHERE e.status = 'ACTIVE'
""")

FEATURE_COLS = [
    "attendance_rate_overall",
    "attendance_rate_2w",
    "avg_grade_overall",
    "avg_grade_last3",
    "assignments_submitted_rate",
    "late_submissions_count",
    "days_since_login",
    "course_week_number",
]


def _safe(val, default=0.0) -> float:
    if val is None:
        return float(default)
    try:
        return float(val)
    except (TypeError, ValueError):
        return float(default)


def extract_student_features(db: Session, enrollment_id: str) -> pd.DataFrame:
    row = db.execute(_STUDENT_FEATURE_SQL, {"enrollment_id": enrollment_id}).fetchone()
    if row is None:
        logger.warning("extract_student_features: enrollment %s not found", enrollment_id)
        return pd.DataFrame(columns=["enrollment_id"] + FEATURE_COLS)

    record = {
        "enrollment_id": str(row.enrollment_id),
        "attendance_rate_overall": _safe(row.attendance_rate_overall),
        "attendance_rate_2w": _safe(row.attendance_rate_2w),
        "avg_grade_overall": _safe(row.avg_grade_overall),
        "avg_grade_last3": _safe(row.avg_grade_last3),
        "assignments_submitted_rate": _safe(row.assignments_submitted_rate),
        "late_submissions_count": _safe(row.late_submissions_count),
        "days_since_login": _safe(row.days_since_login, 30),
        "course_week_number": _safe(row.course_week_number),
    }
    return pd.DataFrame([record])


def extract_all_active_students(db: Session) -> pd.DataFrame:
    rows = db.execute(_BATCH_FEATURE_SQL).fetchall()
    if not rows:
        return pd.DataFrame(columns=["enrollment_id"] + FEATURE_COLS)

    records = []
    for row in rows:
        records.append({
            "enrollment_id": str(row.enrollment_id),
            "student_id": str(row.student_id),
            "course_id": str(row.course_id),
            "attendance_rate_overall": _safe(row.attendance_rate_overall),
            "attendance_rate_2w": _safe(row.attendance_rate_2w),
            "avg_grade_overall": _safe(row.avg_grade_overall),
            "avg_grade_last3": _safe(row.avg_grade_last3),
            "assignments_submitted_rate": _safe(row.assignments_submitted_rate),
            "late_submissions_count": _safe(row.late_submissions_count),
            "days_since_login": _safe(row.days_since_login, 30),
            "course_week_number": _safe(row.course_week_number),
        })
    return pd.DataFrame(records)


def extract_course_stats(db: Session, course_id: str) -> dict:
    row = db.execute(
        text("""
            SELECT
                COUNT(e.id)::int AS total_students,
                COUNT(e.id) FILTER (WHERE e.status = 'ACTIVE')::int AS active_count,
                COUNT(e.id) FILTER (WHERE e.dropout_risk_score >= 0.65)::int AS high_risk,
                COUNT(e.id) FILTER (WHERE e.dropout_risk_score >= 0.40
                    AND e.dropout_risk_score < 0.65)::int AS medium_risk,
                COUNT(e.id) FILTER (WHERE e.dropout_risk_score < 0.40
                    OR e.dropout_risk_score IS NULL)::int AS low_risk,
                AVG(
                    CASE WHEN att_stats.rate IS NOT NULL THEN att_stats.rate ELSE NULL END
                )::float AS avg_att_rate,
                AVG(gr_stats.avg_grade)::float AS avg_grade
            FROM enrollments e
            LEFT JOIN (
                SELECT a.enrollment_id,
                    COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float
                        / NULLIF(COUNT(*),0) AS rate
                FROM attendance a
                GROUP BY a.enrollment_id
            ) att_stats ON att_stats.enrollment_id = e.id
            LEFT JOIN (
                SELECT g.enrollment_id,
                    AVG(g.score / NULLIF(ast.max_score, 0)) AS avg_grade
                FROM grades g JOIN assessments ast ON ast.id = g.assessment_id
                GROUP BY g.enrollment_id
            ) gr_stats ON gr_stats.enrollment_id = e.id
            WHERE e.course_id = :course_id
        """),
        {"course_id": course_id},
    ).fetchone()

    weekly_att = db.execute(
        text("""
            SELECT
                DATE_TRUNC('week', a.lesson_date)::date AS week_start,
                COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float
                    / NULLIF(COUNT(*),0) AS att_rate,
                COUNT(*)::int AS total
            FROM attendance a
            JOIN enrollments e ON e.id = a.enrollment_id
            WHERE e.course_id = :course_id
            GROUP BY week_start
            ORDER BY week_start DESC
            LIMIT 8
        """),
        {"course_id": course_id},
    ).fetchall()

    grade_dist = db.execute(
        text("""
            SELECT
                CASE
                    WHEN (g.score / NULLIF(ast.max_score,0)) >= 0.9 THEN '90-100'
                    WHEN (g.score / NULLIF(ast.max_score,0)) >= 0.8 THEN '80-90'
                    WHEN (g.score / NULLIF(ast.max_score,0)) >= 0.7 THEN '70-80'
                    WHEN (g.score / NULLIF(ast.max_score,0)) >= 0.6 THEN '60-70'
                    ELSE '<60'
                END AS range,
                COUNT(*)::int AS count
            FROM grades g
            JOIN assessments ast ON ast.id = g.assessment_id
            JOIN enrollments e ON e.id = g.enrollment_id
            WHERE e.course_id = :course_id
            GROUP BY range
            ORDER BY range
        """),
        {"course_id": course_id},
    ).fetchall()

    top_students = db.execute(
        text("""
            SELECT u.id, u.first_name, u.last_name,
                COALESCE(att_s.rate, 0) AS att_rate,
                COALESCE(gr_s.avg_grade, 0) AS avg_grade,
                (COALESCE(att_s.rate, 0) * 0.4 + COALESCE(gr_s.avg_grade, 0) * 0.6) AS score
            FROM enrollments e
            JOIN users u ON u.id = e.student_id
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
            WHERE e.course_id = :course_id AND e.status = 'ACTIVE'
            ORDER BY score DESC
            LIMIT 5
        """),
        {"course_id": course_id},
    ).fetchall()

    at_risk = db.execute(
        text("""
            SELECT u.id, u.first_name, u.last_name, e.id AS enrollment_id,
                e.dropout_risk_score
            FROM enrollments e
            JOIN users u ON u.id = e.student_id
            WHERE e.course_id = :course_id
              AND e.status = 'ACTIVE'
              AND e.dropout_risk_score >= 0.65
            ORDER BY e.dropout_risk_score DESC
        """),
        {"course_id": course_id},
    ).fetchall()

    return {
        "total_students": row.total_students or 0,
        "active_count": row.active_count or 0,
        "avg_attendance_rate": _safe(row.avg_att_rate) * 100,
        "avg_grade": _safe(row.avg_grade) * 100,
        "dropout_risk_distribution": {
            "low":    row.low_risk or 0,
            "medium": row.medium_risk or 0,
            "high":   row.high_risk or 0,
        },
        "grade_distribution": [{"range": r.range, "count": r.count} for r in grade_dist],
        "weekly_attendance": [
            {
                "week": str(r.week_start),
                "rate": round(_safe(r.att_rate) * 100, 1),
                "total": r.total,
            }
            for r in reversed(weekly_att)
        ],
        "top_students": [
            {
                "id": str(r.id),
                "name": f"{r.first_name} {r.last_name}",
                "attendanceRate": round(_safe(r.att_rate) * 100, 1),
                "avgGrade": round(_safe(r.avg_grade) * 100, 1),
            }
            for r in top_students
        ],
        "at_risk_students": [
            {
                "id": str(r.id),
                "enrollmentId": str(r.enrollment_id),
                "name": f"{r.first_name} {r.last_name}",
                "riskScore": _safe(r.dropout_risk_score),
            }
            for r in at_risk
        ],
    }


def extract_grade_trend(db: Session, enrollment_id: str) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT
                DATE_TRUNC('week', g.graded_at)::date AS week_start,
                AVG(g.score / NULLIF(ast.max_score, 0))::float AS avg,
                COUNT(*)::int AS count
            FROM grades g
            JOIN assessments ast ON ast.id = g.assessment_id
            WHERE g.enrollment_id = :eid
            GROUP BY week_start
            ORDER BY week_start
        """),
        {"eid": enrollment_id},
    ).fetchall()
    return [
        {"week": str(r.week_start), "avg": round(_safe(r.avg) * 100, 1), "count": r.count}
        for r in rows
    ]


def extract_absence_trend(db: Session, enrollment_id: str) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT
                DATE_TRUNC('week', a.lesson_date)::date AS week_start,
                COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absences
            FROM attendance a
            WHERE a.enrollment_id = :eid
            GROUP BY week_start
            ORDER BY week_start DESC
            LIMIT 4
        """),
        {"eid": enrollment_id},
    ).fetchall()
    return [{"week": str(r.week_start), "absences": r.absences} for r in reversed(rows)]
