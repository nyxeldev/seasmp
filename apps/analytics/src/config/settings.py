import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]
REDIS_URL: str    = os.environ.get("REDIS_URL", "redis://localhost:6379")
INTERNAL_API_KEY: str = os.environ.get("INTERNAL_API_KEY", "internal-dev-key-change-in-prod")
MODEL_DIR: str    = os.environ.get("MODEL_DIR", "ml/models")
MODEL_PATH: str   = os.path.join(MODEL_DIR, "latest_model.pkl")
SCALER_PATH: str  = os.path.join(MODEL_DIR, "latest_scaler.pkl")
CORS_ORIGINS: list[str] = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:4000").split(",")
PORT: int         = int(os.environ.get("ANALYTICS_PORT", "5000"))
LOG_LEVEL: str    = os.environ.get("LOG_LEVEL", "info")
DROPOUT_THRESHOLD: float = float(os.environ.get("DROPOUT_THRESHOLD", "0.65"))
API_NODE_URL: str = os.environ.get("API_NODE_URL", "http://localhost:4000")
