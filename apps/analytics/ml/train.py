"""
Model training script.
Usage (from analytics root with venv active):
    python -m ml.train
"""
import json
import logging
import os
import shutil
from datetime import datetime, timezone

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

from src.config.database import SessionLocal
from src.config.settings import MODEL_DIR, MODEL_PATH, SCALER_PATH
from src.services.etl import FEATURE_COLS, extract_all_active_students, _safe
from ml.features import build_feature_matrix, build_labels

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)


def _get_training_data(db):
    """Fetch all enrollments (active + dropped + completed) with features."""
    rows = db.execute(
        text("""
            WITH att AS (
                SELECT a.enrollment_id,
                    COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::float
                        / NULLIF(COUNT(*),0) AS attendance_rate_overall,
                    COUNT(*) FILTER (
                        WHERE a.status IN ('PRESENT','LATE')
                          AND a.lesson_date >= CURRENT_DATE - INTERVAL '14 days'
                    )::float / NULLIF(COUNT(*) FILTER (
                        WHERE a.lesson_date >= CURRENT_DATE - INTERVAL '14 days'
                    ),0) AS attendance_rate_2w,
                    COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent_count
                FROM attendance a GROUP BY a.enrollment_id
            ),
            gr AS (
                SELECT g.enrollment_id,
                    AVG(g.score / NULLIF(ast.max_score,0)) AS avg_grade_overall,
                    AVG(g.score / NULLIF(ast.max_score,0)) AS avg_grade_last3,
                    COUNT(*) FILTER (WHERE ast.type = 'HOMEWORK')::float
                        / NULLIF(COUNT(*) FILTER (WHERE ast.type = 'HOMEWORK'),0) AS assignments_submitted_rate,
                    COUNT(*) FILTER (
                        WHERE ast.due_date IS NOT NULL AND g.graded_at > ast.due_date
                    )::int AS late_submissions_count
                FROM grades g JOIN assessments ast ON ast.id = g.assessment_id
                GROUP BY g.enrollment_id
            )
            SELECT
                e.id AS enrollment_id, e.status,
                COALESCE(att.attendance_rate_overall, 0) AS attendance_rate_overall,
                COALESCE(att.attendance_rate_2w, att.attendance_rate_overall, 0) AS attendance_rate_2w,
                COALESCE(att.absent_count, 0) AS absent_count,
                COALESCE(gr.avg_grade_overall, 0) AS avg_grade_overall,
                COALESCE(gr.avg_grade_last3, 0) AS avg_grade_last3,
                COALESCE(gr.assignments_submitted_rate, 0) AS assignments_submitted_rate,
                COALESCE(gr.late_submissions_count, 0) AS late_submissions_count,
                EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400.0 AS days_since_login,
                EXTRACT(EPOCH FROM (NOW() - e.enrolled_at)) / 604800.0 AS course_week_number
            FROM enrollments e
            JOIN users u ON u.id = e.student_id
            LEFT JOIN att ON att.enrollment_id = e.id
            LEFT JOIN gr  ON gr.enrollment_id  = e.id
            WHERE e.status IN ('ACTIVE', 'DROPPED', 'COMPLETED')
        """)
    ).fetchall()

    import pandas as pd
    records = [
        {
            "enrollment_id": str(r.enrollment_id),
            "status": r.status,
            "attendance_rate_overall": _safe(r.attendance_rate_overall),
            "attendance_rate_2w": _safe(r.attendance_rate_2w),
            "avg_grade_overall": _safe(r.avg_grade_overall),
            "avg_grade_last3": _safe(r.avg_grade_last3),
            "assignments_submitted_rate": _safe(r.assignments_submitted_rate),
            "late_submissions_count": _safe(r.late_submissions_count),
            "days_since_login": _safe(r.days_since_login, 30),
            "course_week_number": _safe(r.course_week_number),
        }
        for r in rows
    ]
    return pd.DataFrame(records)


def train_model(db=None) -> dict:
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        df = _get_training_data(db)
        n_samples = len(df)
        n_dropped = int((df["status"] == "DROPPED").sum())

        if n_samples < 10:
            return {"status": "skipped", "reason": "insufficient_data", "samples": n_samples}
        if n_dropped < 2:
            return {"status": "skipped", "reason": "no_dropout_labels", "samples": n_samples, "dropped": n_dropped}

        X = build_feature_matrix(df)
        y = build_labels(df)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )

        scaler = StandardScaler()
        X_train = scaler.fit_transform(X_train)
        X_test  = scaler.transform(X_test)

        clf = RandomForestClassifier(
            n_estimators=100, max_depth=10,
            class_weight="balanced", random_state=42, n_jobs=-1,
        )
        clf.fit(X_train, y_train)

        y_pred  = clf.predict(X_test)
        y_proba = clf.predict_proba(X_test)[:, 1]
        auc     = roc_auc_score(y_test, y_proba) if len(set(y_test)) > 1 else 0.0
        report  = classification_report(y_test, y_pred, output_dict=True)

        logger.info(
            "Training done: %d samples, %d dropped, AUC=%.4f", n_samples, n_dropped, auc
        )

        # Save with timestamp + update latest
        os.makedirs(MODEL_DIR, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        versioned_model  = os.path.join(MODEL_DIR, f"dropout_model_v{ts}.pkl")
        versioned_scaler = os.path.join(MODEL_DIR, f"scaler_v{ts}.pkl")
        joblib.dump(clf,    versioned_model)
        joblib.dump(scaler, versioned_scaler)
        shutil.copy(versioned_model,  MODEL_PATH)
        shutil.copy(versioned_scaler, SCALER_PATH)

        metadata = {
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "version": ts,
            "samples": n_samples,
            "dropped_count": n_dropped,
            "feature_names": FEATURE_COLS,
            "auc_roc": round(auc, 4),
            "classification_report": report,
            "feature_importances": dict(zip(FEATURE_COLS, clf.feature_importances_.tolist())),
        }
        with open(os.path.join(MODEL_DIR, "model_metadata.json"), "w") as f:
            json.dump(metadata, f, indent=2)

        return {"status": "success", **metadata}

    finally:
        if close_db:
            db.close()


def get_model_metadata() -> dict | None:
    meta_path = os.path.join(MODEL_DIR, "model_metadata.json")
    if not os.path.exists(meta_path):
        return None
    try:
        with open(meta_path) as f:
            return json.load(f)
    except Exception:
        return None


if __name__ == "__main__":
    result = train_model()
    print(json.dumps(result, indent=2, default=str))
