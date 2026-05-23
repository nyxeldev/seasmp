"""Tests for ETL pipeline."""
import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session


class _Row:
    """Fake SQLAlchemy row."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def _make_db(row=None):
    db = MagicMock(spec=Session)
    result = MagicMock()
    result.fetchone.return_value = row
    result.fetchall.return_value = [] if row is None else [row]
    db.execute.return_value = result
    return db


class TestExtractStudentFeatures:
    def test_returns_empty_df_when_not_found(self):
        from src.services.etl import extract_student_features
        db = _make_db(row=None)
        df = extract_student_features(db, "nonexistent-id")
        assert df.empty

    def test_returns_df_with_correct_columns(self):
        from src.services.etl import extract_student_features, FEATURE_COLS
        row = _Row(
            enrollment_id="abc",
            student_id="s1", course_id="c1", status="ACTIVE",
            dropout_risk_score=None, enrolled_at=None,
            attendance_rate_overall=0.8,
            attendance_rate_2w=0.75,
            absent_count=2,
            avg_grade_overall=0.7,
            avg_grade_last3=0.72,
            assignments_submitted_rate=0.9,
            late_submissions_count=1,
            days_since_login=5.0,
            course_week_number=3.0,
        )
        db = _make_db(row=row)
        df = extract_student_features(db, "abc")
        assert not df.empty
        for col in FEATURE_COLS:
            assert col in df.columns

    def test_zero_attendance_gives_rate_zero(self):
        from src.services.etl import extract_student_features
        row = _Row(
            enrollment_id="abc",
            student_id="s1", course_id="c1", status="ACTIVE",
            dropout_risk_score=None, enrolled_at=None,
            attendance_rate_overall=None,
            attendance_rate_2w=None,
            absent_count=0,
            avg_grade_overall=None,
            avg_grade_last3=None,
            assignments_submitted_rate=None,
            late_submissions_count=0,
            days_since_login=None,
            course_week_number=0.0,
        )
        db = _make_db(row=row)
        df = extract_student_features(db, "abc")
        assert df.iloc[0]["attendance_rate_overall"] == 0.0

    def test_null_login_gives_default_30(self):
        from src.services.etl import extract_student_features
        row = _Row(
            enrollment_id="abc",
            student_id="s1", course_id="c1", status="ACTIVE",
            dropout_risk_score=None, enrolled_at=None,
            attendance_rate_overall=0.5,
            attendance_rate_2w=0.5,
            absent_count=0,
            avg_grade_overall=0.5,
            avg_grade_last3=0.5,
            assignments_submitted_rate=0.5,
            late_submissions_count=0,
            days_since_login=None,
            course_week_number=1.0,
        )
        db = _make_db(row=row)
        df = extract_student_features(db, "abc")
        assert df.iloc[0]["days_since_login"] == 30.0


class TestExtractAllActiveStudents:
    def test_returns_empty_df_when_no_active(self):
        from src.services.etl import extract_all_active_students
        db = MagicMock(spec=Session)
        result = MagicMock()
        result.fetchall.return_value = []
        db.execute.return_value = result
        df = extract_all_active_students(db)
        assert df.empty

    def test_returns_multiple_rows(self):
        from src.services.etl import extract_all_active_students
        rows = [
            _Row(enrollment_id=f"e{i}", student_id=f"s{i}", course_id="c1",
                 status="ACTIVE",
                 attendance_rate_overall=0.8, attendance_rate_2w=0.7,
                 avg_grade_overall=0.75, avg_grade_last3=0.75,
                 assignments_submitted_rate=0.9, late_submissions_count=0,
                 days_since_login=5.0, course_week_number=4.0)
            for i in range(5)
        ]
        db = MagicMock(spec=Session)
        result = MagicMock()
        result.fetchall.return_value = rows
        db.execute.return_value = result
        df = extract_all_active_students(db)
        assert len(df) == 5
