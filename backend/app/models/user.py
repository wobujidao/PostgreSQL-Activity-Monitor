from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    VIEWER = "viewer"
    OPERATOR = "operator"


class User(BaseModel):
    login: str
    password: str  # Хэшированный пароль
    role: UserRole = UserRole.VIEWER
    email: str | None = None
    created_at: datetime | None = None
    last_login: datetime | None = None
    is_active: bool = True


class UserCreate(BaseModel):
    login: str
    password: str  # Открытый текст
    role: UserRole = UserRole.VIEWER
    email: str | None = None


class UserUpdate(BaseModel):
    password: str | None = None
    role: UserRole | None = None
    email: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    """Модель для ответа API (без пароля)"""
    login: str
    role: UserRole
    email: str | None = None
    created_at: datetime | None = None
    last_login: datetime | None = None
    is_active: bool
