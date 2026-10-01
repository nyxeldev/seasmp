"""Tests for the Prisma<->analytics schema contract (src/db/schema_contract.py)."""
import pytest
from unittest.mock import MagicMock, patch

from src.db.schema_contract import (
    REQUIRED_SCHEMA,
    SchemaContractError,
    assert_schema_contract,
    validate_schema_contract,
)


def _mock_inspector(tables: dict[str, list[str]]):
    inspector = MagicMock()
    inspector.get_table_names.return_value = list(tables.keys())
    inspector.get_columns.side_effect = lambda table: [{"name": c} for c in tables.get(table, [])]
    return inspector


def _full_schema() -> dict[str, list[str]]:
    return {table: list(cols) for table, cols in REQUIRED_SCHEMA.items()}


class TestValidateSchemaContract:
    def test_no_missing_when_schema_matches(self):
        with patch("src.db.schema_contract.inspect", return_value=_mock_inspector(_full_schema())):
            missing = validate_schema_contract(MagicMock())
        assert missing == []

    def test_reports_missing_table(self):
        schema = _full_schema()
        del schema["grades"]
        with patch("src.db.schema_contract.inspect", return_value=_mock_inspector(schema)):
            missing = validate_schema_contract(MagicMock())
        assert any("grades" in m for m in missing)

    def test_reports_missing_column(self):
        schema = _full_schema()
        schema["enrollments"] = [c for c in schema["enrollments"] if c != "dropout_risk_score"]
        with patch("src.db.schema_contract.inspect", return_value=_mock_inspector(schema)):
            missing = validate_schema_contract(MagicMock())
        assert any("enrollments.dropout_risk_score" in m for m in missing)

    def test_connection_failure_is_reported_not_raised(self):
        inspector = MagicMock()
        inspector.get_table_names.side_effect = RuntimeError("baza yiqildi")
        with patch("src.db.schema_contract.inspect", return_value=inspector):
            missing = validate_schema_contract(MagicMock())
        assert len(missing) == 1
        assert "baza yiqildi" in missing[0]


class TestAssertSchemaContract:
    def test_raises_when_schema_drifted(self):
        schema = _full_schema()
        del schema["assessments"]
        with patch("src.db.schema_contract.inspect", return_value=_mock_inspector(schema)):
            with pytest.raises(SchemaContractError):
                assert_schema_contract(MagicMock())

    def test_does_not_raise_when_schema_matches(self):
        with patch("src.db.schema_contract.inspect", return_value=_mock_inspector(_full_schema())):
            assert_schema_contract(MagicMock())  # no exception
