# app/database/repositories/ssh_key_repo.py
"""
Репозиторий SSH-ключей — CRUD-операции через asyncpg с pgcrypto-шифрованием.
"""
import logging
from app.config import ENCRYPTION_KEY

logger = logging.getLogger(__name__)

# Поля метаданных (без private_key_enc)
_META_FIELDS = (
    "id, name, fingerprint, key_type, public_key, "
    "created_by, created_at, has_passphrase, description"
)


def _get_pool():
    """Ленивый импорт пула — избегаем циклических зависимостей при старте."""
    from app.database.local_db import get_pool
    return get_pool()


async def get_key(key_id: str) -> dict | None:
    """Получить метаданные SSH-ключа по ID (без приватного ключа)."""
    pool = _get_pool()
    row = await pool.fetchrow(
        f"SELECT {_META_FIELDS} FROM ssh_keys WHERE id = $1",
        key_id,
    )
    return dict(row) if row else None


async def list_keys() -> list[dict]:
    """Список всех SSH-ключей (без приватного ключа)."""
    pool = _get_pool()
    rows = await pool.fetch(
        f"SELECT {_META_FIELDS} FROM ssh_keys ORDER BY created_at"
    )
    return [dict(r) for r in rows]


async def create_key(
    id: str,
    name: str,
    fingerprint: str,
    key_type: str,
    public_key: str,
    private_key_pem: str,
    created_by: str,
    has_passphrase: bool = False,
    description: str | None = None,
) -> dict:
    """Создать SSH-ключ. Приватный ключ шифруется pgp_sym_encrypt."""
    pool = _get_pool()
    row = await pool.fetchrow(
        f"INSERT INTO ssh_keys "
        f"(id, name, fingerprint, key_type, public_key, private_key_enc, "
        f" created_by, has_passphrase, description) "
        f"VALUES ($1, $2, $3, $4, $5, pgp_sym_encrypt($6, $7), $8, $9, $10) "
        f"RETURNING {_META_FIELDS}",
        id, name, fingerprint, key_type, public_key,
        private_key_pem, ENCRYPTION_KEY,
        created_by, has_passphrase, description,
    )
    logger.info(f"Создан SSH-ключ: {name} ({key_type}, id={id})")
    return dict(row)


async def update_key(
    key_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
) -> dict | None:
    """Обновить метаданные SSH-ключа (только переданные non-None поля)."""
    fields = {}
    if name is not None:
        fields["name"] = name
    if description is not None:
        fields["description"] = description

    if not fields:
        return await get_key(key_id)

    # Строим SET-часть: field1 = $2, field2 = $3, ...
    set_parts = []
    params = [key_id]  # $1 = key_id
    for i, (col, val) in enumerate(fields.items(), start=2):
        set_parts.append(f"{col} = ${i}")
        params.append(val)

    set_clause = ", ".join(set_parts)

    pool = _get_pool()
    row = await pool.fetchrow(
        f"UPDATE ssh_keys SET {set_clause} WHERE id = $1 RETURNING {_META_FIELDS}",
        *params,
    )
    if row:
        logger.info(f"Обновлён SSH-ключ: id={key_id} (поля: {', '.join(fields)})")
    return dict(row) if row else None


async def delete_key(key_id: str) -> bool:
    """Удалить SSH-ключ. Возвращает True если удалён."""
    pool = _get_pool()
    result = await pool.execute("DELETE FROM ssh_keys WHERE id = $1", key_id)
    deleted = result == "DELETE 1"
    if deleted:
        logger.info(f"Удалён SSH-ключ: id={key_id}")
    return deleted


async def get_private_key_content(key_id: str) -> str | None:
    """Получить расшифрованный приватный ключ (PEM) по ID."""
    pool = _get_pool()
    row = await pool.fetchrow(
        "SELECT pgp_sym_decrypt(private_key_enc::bytea, $2) AS pem "
        "FROM ssh_keys WHERE id = $1",
        key_id, ENCRYPTION_KEY,
    )
    return row["pem"] if row else None


async def get_servers_count(key_id: str) -> int:
    """Количество серверов, использующих данный SSH-ключ."""
    pool = _get_pool()
    count = await pool.fetchval(
        "SELECT COUNT(*) FROM servers WHERE ssh_key_id = $1",
        key_id,
    )
    return count
