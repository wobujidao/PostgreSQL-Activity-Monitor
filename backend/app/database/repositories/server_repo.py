# app/database/repositories/server_repo.py
"""
Репозиторий серверов — CRUD-операции через asyncpg с pgcrypto-шифрованием.
"""
import logging
from app.config import ENCRYPTION_KEY

logger = logging.getLogger(__name__)

# SQL-фрагмент для SELECT с расшифровкой паролей
_SELECT_DECRYPTED = """
    SELECT
        name,
        host,
        port,
        pg_user,
        CASE WHEN password_enc IS NOT NULL
             THEN pgp_sym_decrypt(password_enc::bytea, $1)
             ELSE '' END AS password,
        ssh_user,
        CASE WHEN ssh_password_enc IS NOT NULL
             THEN pgp_sym_decrypt(ssh_password_enc::bytea, $1)
             ELSE '' END AS ssh_password,
        ssh_port,
        ssh_auth_type,
        ssh_key_id,
        CASE WHEN ssh_key_passphrase_enc IS NOT NULL
             THEN pgp_sym_decrypt(ssh_key_passphrase_enc::bytea, $1)
             ELSE '' END AS ssh_key_passphrase,
        created_at,
        updated_at
"""


def _get_pool():
    """Ленивый импорт пула — избегаем циклических зависимостей при старте."""
    from app.database.local_db import get_pool
    return get_pool()


def _row_to_dict(row) -> dict:
    """Преобразовать asyncpg.Record в dict с маппингом полей."""
    d = dict(row)
    # pg_user -> user
    d["user"] = d.pop("pg_user", d.get("user"))
    return d


async def get_server(name: str) -> dict | None:
    """Получить сервер по имени с расшифрованными паролями."""
    pool = _get_pool()
    row = await pool.fetchrow(
        _SELECT_DECRYPTED + " FROM servers WHERE name = $2",
        ENCRYPTION_KEY, name,
    )
    return _row_to_dict(row) if row else None


async def list_servers() -> list[dict]:
    """Список всех серверов с расшифрованными паролями."""
    pool = _get_pool()
    rows = await pool.fetch(
        _SELECT_DECRYPTED + " FROM servers ORDER BY name",
        ENCRYPTION_KEY,
    )
    return [_row_to_dict(r) for r in rows]


async def create_server(
    name: str,
    host: str,
    port: int,
    user: str,
    password: str,
    ssh_user: str,
    ssh_password: str,
    ssh_port: int,
    ssh_auth_type: str = "password",
    ssh_key_id: str | None = None,
    ssh_key_passphrase: str | None = None,
) -> dict:
    """Создать сервер. Пароли шифруются pgp_sym_encrypt."""
    pool = _get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO servers (
            name, host, port, pg_user,
            password_enc, ssh_user, ssh_password_enc,
            ssh_port, ssh_auth_type, ssh_key_id, ssh_key_passphrase_enc
        ) VALUES (
            $1, $2, $3, $4,
            CASE WHEN $5 IS NOT NULL AND $5 != '' THEN pgp_sym_encrypt($5, $12) ELSE NULL END,
            $6,
            CASE WHEN $7 IS NOT NULL AND $7 != '' THEN pgp_sym_encrypt($7, $12) ELSE NULL END,
            $8, $9, $10,
            CASE WHEN $11 IS NOT NULL AND $11 != '' THEN pgp_sym_encrypt($11, $12) ELSE NULL END
        )
        RETURNING
            name, host, port, pg_user,
            CASE WHEN password_enc IS NOT NULL
                 THEN pgp_sym_decrypt(password_enc::bytea, $12)
                 ELSE '' END AS password,
            ssh_user,
            CASE WHEN ssh_password_enc IS NOT NULL
                 THEN pgp_sym_decrypt(ssh_password_enc::bytea, $12)
                 ELSE '' END AS ssh_password,
            ssh_port, ssh_auth_type, ssh_key_id,
            CASE WHEN ssh_key_passphrase_enc IS NOT NULL
                 THEN pgp_sym_decrypt(ssh_key_passphrase_enc::bytea, $12)
                 ELSE '' END AS ssh_key_passphrase,
            created_at, updated_at
        """,
        name, host, port, user,
        password or None, ssh_user, ssh_password or None,
        ssh_port, ssh_auth_type, ssh_key_id or None, ssh_key_passphrase or None,
        ENCRYPTION_KEY,
    )
    logger.info(f"Создан сервер: {name} ({host}:{port})")
    return _row_to_dict(row)


async def update_server(
    name: str,
    *,
    host: str | None = None,
    port: int | None = None,
    user: str | None = None,
    password: str | None = None,
    ssh_user: str | None = None,
    ssh_password: str | None = None,
    ssh_port: int | None = None,
    ssh_auth_type: str | None = None,
    ssh_key_id: str | None = None,
    ssh_key_passphrase: str | None = None,
) -> dict | None:
    """Обновить поля сервера (только переданные non-None). Возвращает None если не найден."""
    # Собираем SET-части и параметры
    # $1 = name (WHERE), последний параметр = ENCRYPTION_KEY
    set_parts = []
    params: list = [name]  # $1
    idx = 2  # следующий плейсхолдер

    plain_fields = {
        "host": host,
        "port": port,
        "pg_user": user,
        "ssh_user": ssh_user,
        "ssh_port": ssh_port,
        "ssh_auth_type": ssh_auth_type,
        "ssh_key_id": ssh_key_id,
    }

    for col, val in plain_fields.items():
        if val is not None:
            set_parts.append(f"{col} = ${idx}")
            params.append(val)
            idx += 1

    # Шифруемые поля: password -> password_enc, и т.д.
    enc_fields = {
        "password_enc": password,
        "ssh_password_enc": ssh_password,
        "ssh_key_passphrase_enc": ssh_key_passphrase,
    }

    # Индекс для ключа шифрования добавим в конце
    enc_key_idx = None
    for col, val in enc_fields.items():
        if val is not None:
            if enc_key_idx is None:
                # Добавляем ENCRYPTION_KEY как параметр один раз
                params.append(ENCRYPTION_KEY)
                enc_key_idx = idx
                idx += 1
            params.append(val)
            val_idx = idx
            idx += 1
            set_parts.append(
                f"{col} = CASE WHEN ${val_idx} != '' "
                f"THEN pgp_sym_encrypt(${val_idx}, ${enc_key_idx}) ELSE NULL END"
            )

    if not set_parts:
        return await get_server(name)

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    # Для RETURNING нужен ключ шифрования — если ещё не добавлен, добавляем
    if enc_key_idx is None:
        params.append(ENCRYPTION_KEY)
        enc_key_idx = idx
        idx += 1

    pool = _get_pool()
    row = await pool.fetchrow(
        f"""
        UPDATE servers SET {set_clause}
        WHERE name = $1
        RETURNING
            name, host, port, pg_user,
            CASE WHEN password_enc IS NOT NULL
                 THEN pgp_sym_decrypt(password_enc::bytea, ${enc_key_idx})
                 ELSE '' END AS password,
            ssh_user,
            CASE WHEN ssh_password_enc IS NOT NULL
                 THEN pgp_sym_decrypt(ssh_password_enc::bytea, ${enc_key_idx})
                 ELSE '' END AS ssh_password,
            ssh_port, ssh_auth_type, ssh_key_id,
            CASE WHEN ssh_key_passphrase_enc IS NOT NULL
                 THEN pgp_sym_decrypt(ssh_key_passphrase_enc::bytea, ${enc_key_idx})
                 ELSE '' END AS ssh_key_passphrase,
            created_at, updated_at
        """,
        *params,
    )
    if row:
        logger.info(f"Обновлён сервер: {name} (поля: {', '.join(set_parts[:-1])})")
    return _row_to_dict(row) if row else None


async def delete_server(name: str) -> bool:
    """Удалить сервер. Возвращает True если удалён."""
    pool = _get_pool()
    result = await pool.execute("DELETE FROM servers WHERE name = $1", name)
    deleted = result == "DELETE 1"
    if deleted:
        logger.info(f"Удалён сервер: {name}")
    return deleted
