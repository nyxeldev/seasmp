"""Tests for the data-retention cleanup task (DB fix phase, H2)."""
from unittest.mock import MagicMock
from sqlalchemy.orm import Session

from src.tasks.retention_tasks import _batched_delete, BATCH_SIZE


def _make_db(rowcounts):
    """Each call to db.execute() returns the next rowcount in sequence."""
    db = MagicMock(spec=Session)
    results = [MagicMock(rowcount=n) for n in rowcounts]
    db.execute.side_effect = results
    return db


class TestBatchedDelete:
    def test_single_small_batch_deletes_everything_in_one_pass(self):
        db = _make_db([3])  # fewer than BATCH_SIZE -> loop stops after first batch
        total = _batched_delete(db, "audit_logs", "created_at < now()", {})
        assert total == 3
        assert db.execute.call_count == 1
        db.commit.assert_called_once()

    def test_multiple_full_batches_then_a_partial_one(self):
        # Two full batches, then a smaller final one — loop must keep going
        # until a batch comes back under BATCH_SIZE, not just run once.
        db = _make_db([BATCH_SIZE, BATCH_SIZE, 42])
        total = _batched_delete(db, "audit_logs", "created_at < now()", {})
        assert total == BATCH_SIZE * 2 + 42
        assert db.execute.call_count == 3
        assert db.commit.call_count == 3

    def test_zero_matching_rows_deletes_nothing(self):
        db = _make_db([0])
        total = _batched_delete(db, "refresh_tokens", "expires_at < now()", {})
        assert total == 0
        assert db.execute.call_count == 1

    def test_passes_table_and_params_into_the_query(self):
        db = _make_db([0])
        _batched_delete(db, "ip_blocks", "expires_at < now() AND ip_address = :ip", {"ip": "1.2.3.4"})
        call_args = db.execute.call_args
        compiled_sql = str(call_args[0][0])
        assert "ip_blocks" in compiled_sql
        assert call_args[0][1]["ip"] == "1.2.3.4"
        assert call_args[0][1]["batch_size"] == BATCH_SIZE


class TestCleanupExpiredData:
    def test_runs_all_three_cleanups_and_returns_counts(self, monkeypatch):
        from src.tasks import retention_tasks

        calls = []

        def fake_batched_delete(db, table, where_sql, params):
            calls.append(table)
            return {"audit_logs": 5, "refresh_tokens": 2, "ip_blocks": 1}[table]

        monkeypatch.setattr(retention_tasks, "_batched_delete", fake_batched_delete)
        # SessionLocal is imported lazily inside the task body via
        # `from src.config.database import SessionLocal` — patch it there.
        import src.config.database as database_module
        monkeypatch.setattr(database_module, "SessionLocal", lambda: MagicMock(spec=Session))

        result = retention_tasks.cleanup_expired_data.run()

        assert result == {
            "auditLogsDeleted": 5,
            "refreshTokensDeleted": 2,
            "ipBlocksDeleted": 1,
            "retentionDays": retention_tasks.AUDIT_LOG_RETENTION_DAYS,
        }
        assert calls == ["audit_logs", "refresh_tokens", "ip_blocks"]
