"""ML model loading and inference with graceful fallback."""
import logging
import os

import joblib
import numpy as np

from src.config.settings import MODEL_PATH, SCALER_PATH, DROPOUT_THRESHOLD
from src.services.etl import FEATURE_COLS

logger = logging.getLogger(__name__)

_model = None
_scaler = None
_model_version: str | None = None

# Hisoblangan model fayli yo'q (yoki yuklanmagan) paytda qoida-asosli
# `_rule_based_score` ishlatiladi — bu HAM "model", shuning uchun u ham o'z
# versiyasiga ega bo'lishi kerak: aks holda dropout_risk_score'ni kim
# hisoblagani noaniq qolardi (aynan shu narsa ikki quvur muammosining
# o'zagi edi). Bu murakkab model registry emas — oddiy, o'zgarmas belgi.
RULE_BASED_VERSION = "rule-based-fallback-v1"


def load_model() -> None:
    global _model, _scaler, _model_version
    if os.path.exists(MODEL_PATH):
        try:
            _model = joblib.load(MODEL_PATH)
            logger.info("Dropout model loaded from %s", MODEL_PATH)
        except Exception as e:
            logger.warning("Failed to load model: %s — using rule-based fallback", e)
            _model = None
    else:
        logger.warning("No model at %s — rule-based fallback active", MODEL_PATH)

    if os.path.exists(SCALER_PATH):
        try:
            _scaler = joblib.load(SCALER_PATH)
            logger.info("Scaler loaded from %s", SCALER_PATH)
        except Exception as e:
            logger.warning("Failed to load scaler: %s", e)
            _scaler = None

    # ml/train.py allaqachon har bir o'qitishda model_metadata.json ga
    # timestamp versiyasini yozadi (ml/train.py:148-159). Yangi versiya
    # o'ylab topish o'rniga xuddi shu versiya qayta ishlatiladi — shunda
    # dropout_risk_score qaysi aniq o'qitilgan modeldan kelganini
    # model_metadata.json bilan to'g'ridan-to'g'ri solishtirish mumkin.
    if _model is not None:
        try:
            from ml.train import get_model_metadata
            meta = get_model_metadata()
            _model_version = meta.get("version") if meta else "unversioned"
        except Exception as e:
            logger.warning("Model metadata o'qilmadi: %s", e)
            _model_version = "unversioned"
    else:
        _model_version = None


def get_model():
    return _model


def is_model_loaded() -> bool:
    return _model is not None


def current_model_version() -> str:
    """Hozir predict_score() qaysi model/versiyadan foydalanayotganini qaytaradi.

    enrollments.score_model_version ustuniga yoziladigan qiymat shu —
    o'qitilgan model yuklangan bo'lsa uning model_metadata.json'dagi haqiqiy
    versiyasi, aks holda qoida-asosli fallback'ning o'zgarmas belgisi.
    """
    return _model_version or RULE_BASED_VERSION


def _rule_based_score(features: dict) -> float:
    att = float(features.get("attendance_rate_overall") or 0)
    grade = float(features.get("avg_grade_overall") or 0)
    days = float(features.get("days_since_login") or 0)
    return round(
        0.4 * (1.0 - att) + 0.4 * (1.0 - grade) + 0.2 * min(days / 30.0, 1.0),
        4,
    )


def _features_to_array(features: dict) -> np.ndarray:
    return np.array([[float(features.get(col) or 0) for col in FEATURE_COLS]])


def predict_score(features: dict) -> float:
    """Return dropout risk score 0.0–1.0."""
    try:
        if _model is not None:
            X = _features_to_array(features)
            if _scaler is not None:
                X = _scaler.transform(X)
            score = float(_model.predict_proba(X)[0][1])
        else:
            score = _rule_based_score(features)
        return round(min(max(score, 0.0), 1.0), 4)
    except Exception as e:
        logger.error("predict_score failed: %s — returning 0.0", e)
        return 0.0


def score_to_label(score: float) -> str:
    if score >= DROPOUT_THRESHOLD:
        return "high"
    if score >= 0.40:
        return "medium"
    return "low"
