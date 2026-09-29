import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/seasmp_db")
REDIS_URL: str    = os.environ.get("REDIS_URL", "redis://localhost:6379")
INTERNAL_API_KEY: str = os.environ.get("INTERNAL_API_KEY", "internal-dev-key-change-in-prod")
MODEL_DIR: str    = os.environ.get("MODEL_DIR", "ml/models")
MODEL_PATH: str   = os.path.join(MODEL_DIR, "latest_model.pkl")
SCALER_PATH: str  = os.path.join(MODEL_DIR, "latest_scaler.pkl")

# Eski (legacy) `/dropout/*` quvuri o'z modelini shu yerga yozadi.
#
# Nega alohida: u `dropout_service` dagi 7 ta xususiyat bilan o'qitadi, asosiy
# quvur esa `etl` dagi 8 ta bilan. Ikkalasi ham MODEL_PATH ga yozganda fayl
# ustma-ust tushib, keyingi yuklashda "X has 8 features, but the model expects 7"
# xatosi chiqardi. Endi ular bir-biriga tegmaydi.
LEGACY_MODEL_PATH: str = os.path.join(MODEL_DIR, "legacy_dropout_model.pkl")
CORS_ORIGINS: list[str] = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:4000").split(",")
PORT: int         = int(os.environ.get("ANALYTICS_PORT", "5000"))
LOG_LEVEL: str    = os.environ.get("LOG_LEVEL", "info")
DROPOUT_THRESHOLD: float = float(os.environ.get("DROPOUT_THRESHOLD", "0.65"))
API_NODE_URL: str = os.environ.get("API_NODE_URL", "http://localhost:4000")
