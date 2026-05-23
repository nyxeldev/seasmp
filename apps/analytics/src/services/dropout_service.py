import os
import logging
from typing import Optional
import joblib
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.config.settings import MODEL_PATH, DROPOUT_THRESHOLD

logger = logging.getLogger(__name__)

_model = None


def load_model() -> None:
    global _model
    if os.path.exists(MODEL_PATH):
        _model = joblib.load(MODEL_PATH)
        logger.info("Dropout model loaded from %s", MODEL_PATH)
    else:
        logger.warning("No model file at %s — using rule-based fallback", MODEL_PATH)


def get_model():
    return _model


FEATURE_SQL = text("""
WITH att AS (
    SELECT
        a.enrollment_id,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT')::float / NULLIF(COUNT(*), 0) AS att_rate,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT' AND a.lesson_date >= NOW() - INTERVAL '30 days')::float
            / NULLIF(COUNT(*) FILTER (WHERE a.lesson_date >= NOW() - INTERVAL '30 days'), 0) AS att_rate_30d
    FROM attendance a
    GROUP BY a.enrollment_id
),
gr AS (
    SELECT
        g.enrollment_id,
        AVG(g.score / NULLIF(ast.max_score, 0))::float AS avg_grade,
        AVG(CASE WHEN ast.due_date IS NOT NULL AND g.graded_at > ast.due_date THEN 1 ELSE 0 END)::float AS late_submission_rate,
        COUNT(*)::int AS submission_count
    FROM grades g
    JOIN assessments ast ON ast.id = g.assessment_id
    GROUP BY g.enrollment_id
),
total_ast AS (
    SELECT c.id AS course_id, COUNT(ast.id)::int AS total_assessments
    FROM courses c
    LEFT JOIN assessments ast ON ast.course_id = c.id
    GROUP BY c.id
)
SELECT
    e.id                                                        AS enrollment_id,
    e.student_id,
    e.course_id,
    e.status,
    e.dropout_risk_score,
    COALESCE(att.att_rate, 0)::float                           AS att_overall,
    COALESCE(att.att_rate_30d, att.att_rate, 0)::float         AS att_rate_30d,
    COALESCE(gr.avg_grade, 0)::float                           AS avg_grade_overall,
    COALESCE(gr.late_submission_rate, 0)::float                AS late_submission_rate,
    COALESCE(gr.submission_count, 0)::int                      AS submission_count,
    COALESCE(ta.total_assessments, 0)::int                     AS total_assessments,
    EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400.0    AS days_since_login
FROM enrollments e
JOIN users u ON u.id = e.student_id
LEFT JOIN att ON att.enrollment_id = e.id
LEFT JOIN gr  ON gr.enrollment_id  = e.id
LEFT JOIN total_ast ta ON ta.course_id = e.course_id
WHERE e.id = :enrollment_id
""")

BATCH_SQL = text("""
WITH att AS (
    SELECT
        a.enrollment_id,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT')::float / NULLIF(COUNT(*), 0) AS att_rate,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT' AND a.lesson_date >= NOW() - INTERVAL '30 days')::float
            / NULLIF(COUNT(*) FILTER (WHERE a.lesson_date >= NOW() - INTERVAL '30 days'), 0) AS att_rate_30d
    FROM attendance a
    GROUP BY a.enrollment_id
),
gr AS (
    SELECT
        g.enrollment_id,
        AVG(g.score / NULLIF(ast.max_score, 0))::float AS avg_grade,
        AVG(CASE WHEN ast.due_date IS NOT NULL AND g.graded_at > ast.due_date THEN 1 ELSE 0 END)::float AS late_submission_rate,
        COUNT(*)::int AS submission_count
    FROM grades g
    JOIN assessments ast ON ast.id = g.assessment_id
    GROUP BY g.enrollment_id
),
total_ast AS (
    SELECT c.id AS course_id, COUNT(ast.id)::int AS total_assessments
    FROM courses c
    LEFT JOIN assessments ast ON ast.course_id = c.id
    GROUP BY c.id
)
SELECT
    e.id                                                        AS enrollment_id,
    e.student_id,
    e.course_id,
    e.status,
    e.dropout_risk_score,
    COALESCE(att.att_rate, 0)::float                           AS att_overall,
    COALESCE(att.att_rate_30d, att.att_rate, 0)::float         AS att_rate_30d,
    COALESCE(gr.avg_grade, 0)::float                           AS avg_grade_overall,
    COALESCE(gr.late_submission_rate, 0)::float                AS late_submission_rate,
    COALESCE(gr.submission_count, 0)::int                      AS submission_count,
    COALESCE(ta.total_assessments, 0)::int                     AS total_assessments,
    EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400.0    AS days_since_login
FROM enrollments e
JOIN users u ON u.id = e.student_id
LEFT JOIN att ON att.enrollment_id = e.id
LEFT JOIN gr  ON gr.enrollment_id  = e.id
LEFT JOIN total_ast ta ON ta.course_id = e.course_id
WHERE e.course_id = :course_id
  AND e.status = 'ACTIVE'
""")

TRAIN_SQL = text("""
WITH att AS (
    SELECT
        a.enrollment_id,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT')::float / NULLIF(COUNT(*), 0) AS att_rate,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT' AND a.lesson_date >= NOW() - INTERVAL '30 days')::float
            / NULLIF(COUNT(*) FILTER (WHERE a.lesson_date >= NOW() - INTERVAL '30 days'), 0) AS att_rate_30d
    FROM attendance a
    GROUP BY a.enrollment_id
),
gr AS (
    SELECT
        g.enrollment_id,
        AVG(g.score / NULLIF(ast.max_score, 0))::float AS avg_grade,
        AVG(CASE WHEN ast.due_date IS NOT NULL AND g.graded_at > ast.due_date THEN 1 ELSE 0 END)::float AS late_submission_rate,
        COUNT(*)::int AS submission_count
    FROM grades g
    JOIN assessments ast ON ast.id = g.assessment_id
    GROUP BY g.enrollment_id
),
total_ast AS (
    SELECT c.id AS course_id, COUNT(ast.id)::int AS total_assessments
    FROM courses c
    LEFT JOIN assessments ast ON ast.course_id = c.id
    GROUP BY c.id
)
SELECT
    e.id                                                        AS enrollment_id,
    e.status,
    COALESCE(att.att_rate, 0)::float                           AS att_overall,
    COALESCE(att.att_rate_30d, att.att_rate, 0)::float         AS att_rate_30d,
    COALESCE(gr.avg_grade, 0)::float                           AS avg_grade_overall,
    COALESCE(gr.late_submission_rate, 0)::float                AS late_submission_rate,
    COALESCE(gr.submission_count, 0)::int                      AS submission_count,
    COALESCE(ta.total_assessments, 0)::int                     AS total_assessments,
    EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400.0    AS days_since_login
FROM enrollments e
JOIN users u ON u.id = e.student_id
LEFT JOIN att ON att.enrollment_id = e.id
LEFT JOIN gr  ON gr.enrollment_id  = e.id
LEFT JOIN total_ast ta ON ta.course_id = e.course_id
WHERE e.status IN ('DROPPED', 'COMPLETED', 'ACTIVE')
""")

FEATURE_COLS = [
    "att_overall",
    "att_rate_30d",
    "avg_grade_overall",
    "late_submission_rate",
    "submission_count",
    "total_assessments",
    "days_since_login",
]


def _rule_based_score(row: dict) -> float:
    att = float(row.get("att_overall") or 0)
    grade = float(row.get("avg_grade_overall") or 0)
    days = float(row.get("days_since_login") or 0)
    return round(
        0.4 * (1.0 - att) + 0.4 * (1.0 - grade) + 0.2 * min(days / 30.0, 1.0),
        4,
    )


def _row_to_features(row) -> list[float]:
    return [
        float(row.att_overall or 0),
        float(row.att_rate_30d or 0),
        float(row.avg_grade_overall or 0),
        float(row.late_submission_rate or 0),
        float(row.submission_count or 0),
        float(row.total_assessments or 0),
        float(row.days_since_login or 0),
    ]


def predict_single(db: Session, enrollment_id: str) -> Optional[dict]:
    result = db.execute(FEATURE_SQL, {"enrollment_id": enrollment_id})
    row = result.fetchone()
    if row is None:
        return None

    row_dict = row._asdict()
    model = get_model()
    if model is not None:
        features = np.array([_row_to_features(row)])
        risk_score = float(model.predict_proba(features)[0][1])
    else:
        risk_score = _rule_based_score(row_dict)

    risk_score = round(risk_score, 4)
    is_high_risk = risk_score >= DROPOUT_THRESHOLD

    db.execute(
        text("UPDATE enrollments SET dropout_risk_score = :score WHERE id = :id"),
        {"score": risk_score, "id": enrollment_id},
    )
    db.commit()

    return {
        "enrollmentId": enrollment_id,
        "studentId": str(row.student_id),
        "courseId": str(row.course_id),
        "riskScore": risk_score,
        "isHighRisk": is_high_risk,
        "features": {col: row_dict.get(col) for col in FEATURE_COLS},
        "modelUsed": "random_forest" if model is not None else "rule_based",
    }


def predict_batch(db: Session, course_id: str) -> list[dict]:
    result = db.execute(BATCH_SQL, {"course_id": course_id})
    rows = result.fetchall()

    model = get_model()
    output = []
    for row in rows:
        row_dict = row._asdict()
        if model is not None:
            features = np.array([_row_to_features(row)])
            risk_score = float(model.predict_proba(features)[0][1])
        else:
            risk_score = _rule_based_score(row_dict)

        risk_score = round(risk_score, 4)
        output.append({
            "enrollmentId": str(row.enrollment_id),
            "studentId": str(row.student_id),
            "riskScore": risk_score,
            "isHighRisk": risk_score >= DROPOUT_THRESHOLD,
            "features": {col: row_dict.get(col) for col in FEATURE_COLS},
        })

    if output:
        for item in output:
            db.execute(
                text("UPDATE enrollments SET dropout_risk_score = :score WHERE id = :id"),
                {"score": item["riskScore"], "id": item["enrollmentId"]},
            )
        db.commit()

    return output


def get_high_risk(db: Session, threshold: Optional[float] = None, limit: int = 50) -> list[dict]:
    t = threshold if threshold is not None else DROPOUT_THRESHOLD
    result = db.execute(
        text("""
            SELECT e.id AS enrollment_id, e.student_id, e.course_id, e.dropout_risk_score,
                   u.email, u.first_name, u.last_name,
                   c.title AS course_title
            FROM enrollments e
            JOIN users u ON u.id = e.student_id
            JOIN courses c ON c.id = e.course_id
            WHERE e.status = 'ACTIVE'
              AND e.dropout_risk_score >= :threshold
            ORDER BY e.dropout_risk_score DESC
            LIMIT :limit
        """),
        {"threshold": t, "limit": limit},
    )
    rows = result.fetchall()
    return [
        {
            "enrollmentId": str(r.enrollment_id),
            "studentId": str(r.student_id),
            "courseId": str(r.course_id),
            "riskScore": float(r.dropout_risk_score),
            "isHighRisk": True,
            "student": {
                "email": r.email,
                "firstName": r.first_name,
                "lastName": r.last_name,
            },
            "courseTitle": r.course_title,
        }
        for r in rows
    ]


def train_model(db: Session) -> dict:
    from sklearn.ensemble import RandomForestClassifier

    result = db.execute(TRAIN_SQL)
    rows = result.fetchall()

    if len(rows) < 10:
        return {"status": "skipped", "reason": "insufficient_data", "samples": len(rows)}

    X = np.array([_row_to_features(r) for r in rows])
    y = np.array([1 if r.status == "DROPPED" else 0 for r in rows])

    dropped_count = int(y.sum())
    if dropped_count < 2:
        return {"status": "skipped", "reason": "no_dropout_labels", "samples": len(rows)}

    clf = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42, n_jobs=-1)
    clf.fit(X, y)

    os.makedirs(os.path.dirname(MODEL_PATH) if os.path.dirname(MODEL_PATH) else ".", exist_ok=True)
    joblib.dump(clf, MODEL_PATH)

    global _model
    _model = clf
    logger.info("Model trained on %d samples (%d dropped), saved to %s", len(rows), dropped_count, MODEL_PATH)

    return {
        "status": "success",
        "samples": len(rows),
        "droppedCount": dropped_count,
        "featureImportances": dict(zip(FEATURE_COLS, clf.feature_importances_.tolist())),
        "modelPath": MODEL_PATH,
    }
