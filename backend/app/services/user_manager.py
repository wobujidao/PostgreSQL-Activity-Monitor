# app/services/user_manager.py
"""Управление пользователями через PostgreSQL."""
import bcrypt
import logging
from app.models.user import User, UserCreate, UserUpdate, UserResponse, UserRole
from app.database.repositories import user_repo

logger = logging.getLogger(__name__)


async def get_user(username: str) -> User | None:
    data = await user_repo.get_user(username)
    if not data:
        return None
    # Map password_hash -> password for the User model
    data["password"] = data.pop("password_hash")
    return User(**data)


async def create_user(user_create: UserCreate) -> UserResponse:
    # Check existence
    existing = await user_repo.get_user(user_create.login)
    if existing:
        raise ValueError(f"Пользователь {user_create.login} уже существует")

    # Hash password
    hashed = bcrypt.hashpw(user_create.password.encode(), bcrypt.gensalt()).decode()

    data = await user_repo.create_user(
        login=user_create.login,
        password_hash=hashed,
        role=user_create.role,
        email=user_create.email,
    )
    logger.info(f"Создан пользователь: {user_create.login}")
    return UserResponse(**data)


async def update_user(username: str, user_update: UserUpdate) -> UserResponse | None:
    kwargs = {}
    if user_update.password is not None:
        kwargs["password_hash"] = bcrypt.hashpw(user_update.password.encode(), bcrypt.gensalt()).decode()
    if user_update.role is not None:
        kwargs["role"] = user_update.role
    if user_update.email is not None:
        kwargs["email"] = user_update.email
    if user_update.is_active is not None:
        kwargs["is_active"] = user_update.is_active

    data = await user_repo.update_user(username, **kwargs)
    if not data:
        return None
    logger.info(f"Обновлен пользователь: {username}")
    return UserResponse(**data)


async def delete_user(username: str) -> bool:
    deleted = await user_repo.delete_user(username)
    if deleted:
        logger.info(f"Удален пользователь: {username}")
    return deleted


async def list_users() -> list[UserResponse]:
    rows = await user_repo.list_users()
    return [UserResponse(**r) for r in rows]


async def update_last_login(username: str) -> None:
    await user_repo.update_last_login(username)


async def load_users() -> list[dict]:
    """Для совместимости с auth: возвращает raw dicts с password_hash переименованным в password."""
    rows = await user_repo.get_all_users_raw()
    # Auth expects "login" and "password" keys (where password is the hash)
    for r in rows:
        r["password"] = r.pop("password_hash")
    return rows
