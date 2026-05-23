from fastapi import APIRouter
from src.services.ml_model import is_model_loaded
from ml.train import get_model_metadata

router = APIRouter()


@router.get("/health")
def health():
    meta = get_model_metadata()
    return {
        "status": "ok",
        "model_loaded": is_model_loaded(),
        "model_type": "random_forest" if is_model_loaded() else "rule_based_fallback",
        "last_trained": meta.get("trained_at") if meta else None,
        "auc_roc": meta.get("auc_roc") if meta else None,
    }
