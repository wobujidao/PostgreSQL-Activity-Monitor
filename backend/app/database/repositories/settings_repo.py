# app/database/repositories/settings_repo.py
"""Репозиторий настроек — CRUD через asyncpg."""
import logging

logger = logging.getLogger(__name__)


def _get_pool():
    """Ленивый импорт пула — избегаем циклических зависимостей при старте."""
    from app.database.local_db import get_pool
    return get_pool()


async def get_all_settings() -> dict[str, dict]:
    """Получить все настройки как dict {key: {value, value_type, description, updated_at}}."""
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM settings ORDER BY key")
    return {r["key"]: dict(r) for r in rows}


async def get_setting(key: str) -> str | None:
    """Получить значение настройки по ключу."""
    pool = _get_pool()
    row = await pool.fetchrow("SELECT value FROM settings WHERE key = $1", key)
    return row["value"] if row else None


async def get_int_setting(key: str, default: int) -> int:
    """Получить целочисленную настройку с fallback на default."""
    val = await get_setting(key)
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


async def update_settings(updates: dict[str, str]) -> dict[str, dict]:
    """Обновить несколько настроек. updates = {key: value_str}."""
    pool = _get_pool()
    async with pool.acquire() as conn:
        for key, value in updates.items():
            await conn.execute(
                "UPDATE settings SET value = $1, updated_at = now() WHERE key = $2",
                str(value), key,
            )
    logger.info(f"Обновлены настройки: {', '.join(updates.keys())}")
    return await get_all_settings()
