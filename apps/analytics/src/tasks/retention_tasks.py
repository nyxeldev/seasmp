"""Scheduled data-retention cleanup.

Added during the DB fix phase (audit finding H2): `audit_logs` had no
retention/cleanup at all and is written on every single `/v1/*` request
(apps/api/src/services/requestAudit.ts), making it the fastest-growing table
in the database. `refresh_tokens` and `ip_blocks` were also never swept once
expired — only filtered at query time.

This task deletes only rows that are already past their retention
boundary, in small batches (so it never takes one long table-wide lock),
and is safe to run repeatedly (each run only ever removes rows that are
still expired at the time it runs).
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.tasks.celery_app import celery
from src.config.settings import AUDIT_LOG_RETENTION_DAYS

logger = logging.getLogger(__name__)

# Bitta DELETE partiyasining hajmi — butun jadvalni bir zarbada qulflamaslik
# uchun. Har bir partiya o'z tranzaksiyasida commit qilinadi.
BATCH_SIZE = 5000

# Cheksiz tsiklga qarshi xavfsizlik — amalda hech qachon yetib bo'lmaydi
# (bir ishga tushishda eng ko'pi BATCH_SIZE * MAX_BATCHES qator o'chadi).
MAX_BATCHES = 2000


def _batched_delete(db: Session, table: str, where_sql: str, params: dict) -> int:
    """`WHERE where_sql` ga mos qatorlarni id bo'yicha kichik partiyalarda o'chiradi.

    Postgres'da `DELETE ... LIMIT` yo'q, shuning uchun o'chiriladigan id'lar
    avval kichik pastqi so'rov bilan tanlanadi. Har bir partiya alohida
    commit qilinadi — shu jadvaldagi boshqa yozuvlar (masalan yangi audit
    yozuvi) partiyalar orasida bloklanib qolmaydi.
    """
    total = 0
    for _ in range(MAX_BATCHES):
        result = db.execute(
            text(
                f"DELETE FROM {table} WHERE id IN ("
                f"  SELECT id FROM {table} WHERE {where_sql} ORDER BY id LIMIT :batch_size"
                f")"
            ),
            {**params, "batch_size": BATCH_SIZE},
        )
        db.commit()
        deleted = result.rowcount or 0
        total += deleted
        if deleted < BATCH_SIZE:
            break
    return total


@celery.task(name="tasks.retention_tasks.cleanup_expired_data", bind=True, max_retries=2)
def cleanup_expired_data(self):
    """Runs daily at 04:00 Asia/Tashkent.

    Removes:
      - audit_logs older than AUDIT_LOG_RETENTION_DAYS (default 90, env-configurable)
      - refresh_tokens whose expires_at has already passed
      - ip_blocks whose expires_at has already passed

    Never touches rows that are still within retention / not yet expired.
    """
    from src.config.database import SessionLocal

    db = SessionLocal()
    try:
        audit_deleted = _batched_delete(
            db, "audit_logs",
            "created_at < now() - (:retention_days || ' days')::interval",
            {"retention_days": AUDIT_LOG_RETENTION_DAYS},
        )
        tokens_deleted = _batched_delete(
            db, "refresh_tokens", "expires_at < now()", {},
        )
        blocks_deleted = _batched_delete(
            db, "ip_blocks", "expires_at < now()", {},
        )

        logger.info(
            "cleanup_expired_data done: audit_logs=%d refresh_tokens=%d ip_blocks=%d (retention=%dd)",
            audit_deleted, tokens_deleted, blocks_deleted, AUDIT_LOG_RETENTION_DAYS,
        )
        return {
            "auditLogsDeleted": audit_deleted,
            "refreshTokensDeleted": tokens_deleted,
            "ipBlocksDeleted": blocks_deleted,
            "retentionDays": AUDIT_LOG_RETENTION_DAYS,
        }
    except Exception as exc:
        db.rollback()
        logger.error("cleanup_expired_data failed: %s", exc)
        raise self.retry(exc=exc, countdown=600)
    finally:
        db.close()
