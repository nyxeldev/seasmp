import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/seasmp_db")
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

# audit_logs saqlash muddati (kun). Hech qanday hujjatlashtirilgan
# xavfsizlik/audit saqlash talabi loyihada topilmadi (CLAUDE.md,
# PROJECT_CONTEXT.md, README.md tekshirildi) — faqat 2-qatlam xatti-harakat
# profili uchun 30 kunlik OYNA bor (PROFILE_TIMEZONE/WINDOW_DAYS,
# apps/api/src/services/behaviorProfiler.ts). 90 kun shu oynadan 3x katta
# zahira bilan tanlandi: profil doim to'liq 30 kunlik tarixga ega bo'ladi,
# va bu umumiy audit-log saqlash uchun keng tarqalgan konservativ minimum.
# Kerak bo'lsa muhit o'zgaruvchisi bilan o'zgartiriladi — kodga qotirilmagan.
AUDIT_LOG_RETENTION_DAYS: int = int(os.environ.get("AUDIT_LOG_RETENTION_DAYS", "90"))

# SQLAlchemy ulanish puli — standart qiymatlar ilgari database.py'da qattiq
# yozilgan edi (pool_size=5, max_overflow=10); endi muhit o'zgaruvchisi bilan
# sozlanadi, lekin standartlar O'ZGARMAGAN. FastAPI (analytics) + Celery
# worker alohida jarayonlar sifatida HAR BIRI o'z puliga ega — shuning uchun
# standartlar past: 5+10=15 ulanish FastAPI uchun, worker'da concurrency
# soniga ko'ra ko'proq bo'lishi mumkin (worker har bir fork uchun alohida
# engine/pool ochadi). Postgres max_connections=100 bilan solishtirganda bu
# katta zahira qoldiradi.
DB_POOL_SIZE: int = int(os.environ.get("DB_POOL_SIZE", "5"))
DB_MAX_OVERFLOW: int = int(os.environ.get("DB_MAX_OVERFLOW", "10"))
DB_POOL_TIMEOUT_SECONDS: int = int(os.environ.get("DB_POOL_TIMEOUT_SECONDS", "30"))
# Bitta so'rov necha millisekund davom etishiga ruxsat — psycopg2'ga
# connect_args orqali uzatiladi, postgresql.conf o'zgarmaydi.
DB_STATEMENT_TIMEOUT_MS: int = int(os.environ.get("DB_STATEMENT_TIMEOUT_MS", "30000"))
