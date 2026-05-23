"""Redis caching helpers."""
import json
import logging
from typing import Any

import redis as _redis

from src.config.settings import REDIS_URL

logger = logging.getLogger(__name__)

_client: _redis.Redis | None = None


def get_redis() -> _redis.Redis | None:
    global _client
    if _client is None:
        try:
            _client = _redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
            _client.ping()
        except Exception as e:
            logger.warning("Redis unavailable: %s — caching disabled", e)
            _client = None
    return _client


def cache_get(key: str) -> Any | None:
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning("cache_get(%s) failed: %s", key, e)
        return None


def cache_set(key: str, value: Any, ttl: int) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning("cache_set(%s) failed: %s", key, e)


def cache_del(key: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception as e:
        logger.warning("cache_del(%s) failed: %s", key, e)


STUDENT_TTL  = 3600        # 1 hour
COURSE_TTL   = 21600       # 6 hours
RISK_TTL     = 43200       # 12 hours
TEACHER_TTL  = 21600       # 6 hours
