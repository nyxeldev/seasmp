"""Tests for ML model inference."""
import pytest
import numpy as np


def _zero_features() -> dict:
    from src.services.etl import FEATURE_COLS
    return {col: 0.0 for col in FEATURE_COLS}


class TestPredictScore:
    def test_all_zeros_does_not_crash(self):
        from src.services.ml_model import predict_score
        score = predict_score(_zero_features())
        assert isinstance(score, float)

    def test_score_in_valid_range(self):
        from src.services.ml_model import predict_score
        score = predict_score(_zero_features())
        assert 0.0 <= score <= 1.0

    def test_no_model_returns_rule_based_score(self):
        import src.services.ml_model as mm
        original = mm._model
        mm._model = None
        try:
            score = mm.predict_score(_zero_features())
            assert 0.0 <= score <= 1.0
        finally:
            mm._model = original

    def test_high_attendance_high_grade_low_risk(self):
        from src.services.ml_model import predict_score
        import src.services.ml_model as mm
        original = mm._model
        mm._model = None
        try:
            features = _zero_features()
            features["attendance_rate_overall"] = 1.0
            features["avg_grade_overall"] = 1.0
            features["days_since_login"] = 1.0
            score = predict_score(features)
            assert score < 0.40
        finally:
            mm._model = original

    def test_score_to_label(self):
        from src.services.ml_model import score_to_label
        assert score_to_label(0.70) == "high"
        assert score_to_label(0.50) == "medium"
        assert score_to_label(0.20) == "low"


class TestDropoutPredictor:
    def test_predict_batch_100_rows(self):
        """predict_score must handle 100 calls without crashing."""
        from src.services.ml_model import predict_score
        import src.services.ml_model as mm
        original = mm._model
        mm._model = None
        try:
            for _ in range(100):
                score = predict_score(_zero_features())
                assert 0.0 <= score <= 1.0
        finally:
            mm._model = original

    def test_model_unavailable_returns_default(self):
        import src.services.ml_model as mm
        original = mm._model
        mm._model = None
        try:
            score = mm.predict_score(_zero_features())
            assert score >= 0.0
        finally:
            mm._model = original
