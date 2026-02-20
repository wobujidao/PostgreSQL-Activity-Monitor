# app/database/repositories/user_repo.py
"""
Репозиторий пользователей — CRUD-операции через asyncpg.
"""
import logging

logger = logging.getLogger(__name__)


def _get_pool():
    """Ленивый импорт пула — избегаем циклических зависимостей при старте."""
    from app.database.local_db import get_pool
    return get_pool()


async def get_user(login: str) -> dict | None:
    """Получить пользователя по логину (все поля)."""
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM users WHERE login = $1", login)
    return dict(row) if row else None


async def list_users() -> list[dict]:
    """Список всех пользователей (без password_hash)."""
    pool = _get_pool()
    rows = await pool.fetch(
        "SELECT login, role, email, is_active, created_at, updated_at, last_login "
        "FROM users ORDER BY created_at"
    )
    return [dict(r) for r in rows]


async def create_user(
    login: str,
    password_hash: str,
    role: str = "viewer",
    email: str | None = None,
) -> dict:
    """Создать пользователя."""
    pool = _get_pool()
    row = await pool.fetchrow(
        "INSERT INTO users (login, password_hash, role, email) "
        "VALUES ($1, $2, $3, $4) RETURNING *",
        login, password_hash, role, email,
    )
    logger.info(f"Создан пользователь: {login} (role={role})")
    return dict(row)


async def update_user(
    login: str,
    *,
    password_hash: str | None = None,
    role: str | None = None,
    email: str | None = None,
    is_active: bool | None = None,
) -> dict | None:
    """Обновить поля пользователя (только переданные non-None). Возвращает None если не найден."""
    fields = {}
    if password_hash is not None:
        fields["password_hash"] = password_hash
    if role is not None:
        fields["role"] = role
    if email is not None:
        fields["email"] = email
    if is_active is not None:
        fields["is_active"] = is_active

    if not fields:
        return await get_user(login)

    # Строим SET-часть: field1 = $2, field2 = $3, ...
    set_parts = []
    params = [login]  # $1 = login
    for i, (col, val) in enumerate(fields.items(), start=2):
        set_parts.append(f"{col} = ${i}")
        params.append(val)

    set_parts.append("updated_at = now()")
    set_clause = ", ".join(set_parts)

    pool = _get_pool()
    row = await pool.fetchrow(
        f"UPDATE users SET {set_clause} WHERE login = $1 RETURNING *",
        *params,
    )
    if row:
        logger.info(f"Обновлён пользователь: {login} (поля: {', '.join(fields)})")
    return dict(row) if row else None


async def delete_user(login: str) -> bool:
    """Удалить пользователя. Возвращает True если удалён."""
    pool = _get_pool()
    result = await pool.execute("DELETE FROM users WHERE login = $1", login)
    deleted = result == "DELETE 1"
    if deleted:
        logger.info(f"Удалён пользователь: {login}")
    return deleted


async def update_last_login(login: str) -> None:
    """Обновить last_login текущей меткой времени."""
    pool = _get_pool()
    await pool.execute(
        "UPDATE users SET last_login = now() WHERE login = $1", login
    )


async def get_all_users_raw() -> list[dict]:
    """Все пользователи с password_hash (для аутентификации)."""
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM users ORDER BY created_at")
    return [dict(r) for r in rows]
