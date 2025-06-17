from pydantic import BaseModel, EmailStr
from typing import Optional
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
    email: Optional[EmailStr] = None
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    is_active: bool = True

class UserCreate(BaseModel):
    login: str
    password: str  # Открытый текст
    role: UserRole = UserRole.VIEWER
    email: Optional[EmailStr] = None

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[UserRole] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None

class UserResponse(BaseModel):
    """Модель для ответа API (без пароля)"""
    login: str
    role: UserRole
    email: Optional[EmailStr] = None
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    is_active: bool
