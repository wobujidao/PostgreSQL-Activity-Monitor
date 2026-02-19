import re
from pydantic import BaseModel, field_validator
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    VIEWER = "viewer"
    OPERATOR = "operator"


def validate_password_strength(password: str) -> str:
    """Проверка сложности пароля: мин. 8 символов, буквы + цифры"""
    if len(password) < 8:
        raise ValueError("Пароль должен содержать минимум 8 символов")
    if not re.search(r'[a-zA-Zа-яА-Я]', password):
        raise ValueError("Пароль должен содержать хотя бы одну букву")
    if not re.search(r'\d', password):
        raise ValueError("Пароль должен содержать хотя бы одну цифру")
    return password


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

    @field_validator('password')
    @classmethod
    def check_password(cls, v):
        return validate_password_strength(v)


class UserUpdate(BaseModel):
    password: str | None = None
    role: UserRole | None = None
    email: str | None = None
    is_active: bool | None = None

    @field_validator('password')
    @classmethod
    def check_password(cls, v):
        if v is not None:
            return validate_password_strength(v)
        return v


class UserResponse(BaseModel):
    """Модель для ответа API (без пароля)"""
    login: str
    role: UserRole
    email: str | None = None
    created_at: datetime | None = None
    last_login: datetime | None = None
    is_active: bool
