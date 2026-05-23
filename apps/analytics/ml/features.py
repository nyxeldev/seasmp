"""Feature engineering helpers for ML training."""
import numpy as np
import pandas as pd

from src.services.etl import FEATURE_COLS


def build_feature_matrix(df: pd.DataFrame) -> np.ndarray:
    """Return (n_samples, n_features) float array from DataFrame."""
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0
    X = df[FEATURE_COLS].fillna(0.0).astype(float)
    return X.to_numpy()


def build_labels(df: pd.DataFrame) -> np.ndarray:
    """1 = dropped out, 0 = not dropped."""
    return (df["status"] == "DROPPED").astype(int).to_numpy()
