# app/auth/utils.py
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
import logging
from app.config import SECRET_KEY, ALGORITHM, TOKEN_EXPIRATION

logger = logging.getLogger(__name__)


def load_users():
    """Загрузка пользователей (делегирует в user_manager с блокировкой файла)"""
    from app.services import user_manager
    return user_manager._load_users()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

def hash_password(password: str) -> str:
    """Хэширование пароля"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Создание JWT токена"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRATION)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Декодирование JWT токена"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
