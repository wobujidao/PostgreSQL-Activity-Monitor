# app/auth/utils.py
import uuid
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
import logging
from app.config import SECRET_KEY, ALGORITHM, TOKEN_EXPIRATION, REFRESH_TOKEN_EXPIRATION_DAYS

logger = logging.getLogger(__name__)


async def load_users():
    """Загрузка пользователей (делегирует в user_manager)."""
    from app.services import user_manager
    return await user_manager.load_users()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

def hash_password(password: str) -> str:
    """Хэширование пароля"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Создание JWT access токена с jti и type"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRATION)
    to_encode.update({
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "type": "access",
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict, expires_delta: timedelta = None):
    """Создание JWT refresh токена с jti и type"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRATION_DAYS)
    to_encode.update({
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "type": "refresh",
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Декодирование JWT токена"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
