"""Prisma (apps/api/prisma/schema.prisma) va analytics'ning xom SQL so'rovlari
(src/services/etl.py) orasidagi shartnoma.

Nega kerak: analytics PostgreSQL'ga Prisma bilan BIR XIL bazaga SQLAlchemy
orqali, lekin o'z ORM modelisiz, to'g'ridan-to'g'ri xom SQL bilan ulanadi.
Sxemaning yagona egasi — Prisma migratsiyalari. Agar Prisma tomonida biror
jadval yoki ustun o'zgartirilsa/o'chirilsa, bu haqida Python tomonida hech
qanday kompilyatsiya vaqtidagi ogohlantirish yo'q — xato faqat runtime'da,
masalan kechasi ETL (Celery) ishlayotganda, noaniq SQL xatosi sifatida
chiqadi.

Yechim — to'liq ORM emas (bu katta, keraksiz qayta qurish bo'lardi), balki
ETL haqiqatda tayangan aniq (jadval, ustun) juftliklarining markazlashgan
ro'yxati. Bu ro'yxat ilova ishga tushganda (FastAPI startup va har bir Celery
worker boshlanishida) haqiqiy bazaning information_schema'siga solishtiriladi.
Nomuvofiqlik bo'lsa — xizmat sukut emas, ANIQ xato bilan to'xtaydi.
"""
from __future__ import annotations

import logging

from sqlalchemy.engine import Engine
from sqlalchemy import inspect

logger = logging.getLogger(__name__)

# src/services/etl.py dagi _STUDENT_FEATURE_SQL, _BATCH_FEATURE_SQL va
# extract_course_stats/extract_grade_trend/extract_absence_trend xom SQL
# so'rovlari tayanadigan jadval/ustunlar. Yangi xususiyat qo'shilsa yoki
# yangi ustun ishlatilsa — shu yerga ham qo'shilishi SHART.
REQUIRED_SCHEMA: dict[str, set[str]] = {
    "users": {"id", "first_name", "last_name", "last_login_at"},
    "courses": {"id"},
    "enrollments": {
        "id", "student_id", "course_id", "status",
        "dropout_risk_score", "enrolled_at",
        # nightly_risk_calculation (src/tasks/etl_tasks.py) dropout_risk_score
        # bilan birga shu ikkitasini ham yozadi — qaysi model/qachon
        # hisoblaganini bildiradi (DB fix phase: H1, ikkinchi quvur
        # olib tashlandi).
        "score_model_version", "scored_at",
    },
    "attendance": {"enrollment_id", "status", "lesson_date"},
    "assessments": {"id", "course_id", "type", "max_score", "due_date"},
    "grades": {"assessment_id", "enrollment_id", "score", "graded_at"},
    # src/tasks/retention_tasks.py — bosqichma-bosqich o'chirish shu
    # (jadval, ustun) juftliklariga tayanadi.
    "audit_logs":     {"id", "created_at"},
    "refresh_tokens": {"id", "expires_at"},
    "ip_blocks":      {"id", "expires_at"},
}


class SchemaContractError(RuntimeError):
    """Haqiqiy baza sxemasi analytics kutgan shartnomaga mos kelmaganda."""


_last_check_ok: bool | None = None


def validate_schema_contract(engine: Engine) -> list[str]:
    """REQUIRED_SCHEMA ni haqiqiy bazaning information_schema'siga solishtiradi.

    Istisno chiqarmaydi — topilmagan (jadval, ustun) juftliklarining
    o'qiladigan ro'yxatini qaytaradi (bo'sh ro'yxat = hammasi joyida).
    """
    inspector = inspect(engine)
    missing: list[str] = []

    try:
        existing_tables = set(inspector.get_table_names())
    except Exception as exc:  # baza umuman ulanmasa ham aniq xabar bersin
        return [f"bazaga ulanib bo'lmadi: {exc}"]

    for table, columns in REQUIRED_SCHEMA.items():
        if table not in existing_tables:
            missing.append(f"jadval '{table}' topilmadi")
            continue
        existing_columns = {c["name"] for c in inspector.get_columns(table)}
        for col in sorted(columns - existing_columns):
            missing.append(f"{table}.{col} topilmadi")

    return missing


def assert_schema_contract(engine: Engine) -> None:
    """Startup'da chaqiriladi — nomuvofiqlik bo'lsa xizmatni DARHOL to'xtatadi.

    Shuning uchun ishlatiladi: ETL kechasi (Celery) ishga tushib, noaniq SQL
    xatosi bilan jim yiqilishi o'rniga, xizmat umuman ko'tarilmaydi va sabab
    aniq ko'rsatiladi.
    """
    global _last_check_ok
    missing = validate_schema_contract(engine)
    _last_check_ok = not missing

    if missing:
        message = (
            "Analytics ETL Prisma sxemasi bilan mos emas:\n  "
            + "\n  ".join(missing)
            + "\n\nSabab odatda: apps/api/prisma/schema.prisma o'zgargan "
              "(migratsiya qo'llangan), lekin "
              "apps/analytics/src/db/schema_contract.py va/yoki "
              "apps/analytics/src/services/etl.py yangilanmagan."
        )
        logger.error(message)
        raise SchemaContractError(message)

    logger.info("Schema contract OK — %d jadval tekshirildi", len(REQUIRED_SCHEMA))


def schema_contract_status() -> bool | None:
    """Oxirgi assert_schema_contract() natijasi. Hech qachon chaqirilmagan
    bo'lsa None (masalan, test muhitida)."""
    return _last_check_ok
