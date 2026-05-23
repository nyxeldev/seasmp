"""Tests for analytics calculation functions."""
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session


class _Row:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def _asdict(self):
        return self.__dict__.copy()


def _mock_db_scalar(val):
    db = MagicMock(spec=Session)
    r = MagicMock()
    r.scalar.return_value = val
    db.execute.return_value = r
    return db


class TestCalculateStudentMetrics:
    def test_returns_attendance_rate_in_range(self):
        from src.services.analytics import calculate_student_metrics
        from src.services.etl import FEATURE_COLS
        import pandas as pd

        features = {col: 0.8 for col in FEATURE_COLS}
        features["days_since_login"] = 3.0

        with patch("src.services.analytics.extract_student_features") as mock_etl, \
             patch("src.services.analytics.extract_grade_trend", return_value=[]), \
             patch("src.services.analytics.extract_absence_trend", return_value=[]):
            mock_etl.return_value = pd.DataFrame([{"enrollment_id": "e1", **features}])
            db = MagicMock(spec=Session)
            result = calculate_student_metrics(db, "e1")

        assert 0.0 <= result["attendance_rate"] <= 100.0
        assert result["dropout_risk_score"] >= 0.0
        assert result["dropout_risk_label"] in ("low", "medium", "high")

    def test_returns_zero_for_empty_enrollment(self):
        import pandas as pd
        from src.services.analytics import calculate_student_metrics

        with patch("src.services.analytics.extract_student_features") as mock_etl:
            mock_etl.return_value = pd.DataFrame()
            db = MagicMock(spec=Session)
            result = calculate_student_metrics(db, "nonexistent")

        assert result["attendance_rate"] == 0.0
        assert result["dropout_risk_score"] == 0.0


class TestCalculateCourseStats:
    def test_empty_course_returns_zeros(self):
        from src.services.analytics import calculate_course_stats

        with patch("src.services.analytics.extract_course_stats") as mock_fn:
            mock_fn.return_value = {
                "total_students": 0,
                "active_count": 0,
                "avg_attendance_rate": 0.0,
                "avg_grade": 0.0,
                "dropout_risk_distribution": {"low": 0, "medium": 0, "high": 0},
                "grade_distribution": [],
                "weekly_attendance": [],
                "top_students": [],
                "at_risk_students": [],
            }
            db = MagicMock(spec=Session)
            result = calculate_course_stats(db, "empty-course-id")

        assert result["total_students"] == 0
        assert result["avg_attendance_rate"] == 0.0
        assert result["dropout_risk_distribution"]["high"] == 0


class TestCalculateTeacherKpi:
    def test_teacher_with_no_courses_returns_zeros(self):
        from src.services.analytics import calculate_teacher_kpi

        row = _Row(
            total_courses=0,
            total_students=0,
            at_risk_count=0,
            completion_rate=None,
            avg_att=None,
            avg_grade=None,
        )
        db = MagicMock(spec=Session)
        result_mock = MagicMock()
        result_mock.fetchone.return_value = row
        db.execute.return_value = result_mock

        result = calculate_teacher_kpi(db, "teacher-id")

        assert result["total_courses"] == 0
        assert result["total_students"] == 0
        assert result["avg_attendance_rate"] == 0.0
        assert result["at_risk_students_count"] == 0
