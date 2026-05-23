"""Internal API key authentication dependency."""
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

from src.config.settings import INTERNAL_API_KEY

_header = APIKeyHeader(name="X-Internal-Key", auto_error=False)


def require_internal_key(key: str | None = Security(_header)):
    if key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Key")
