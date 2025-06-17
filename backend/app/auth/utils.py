# app/auth/utils.py
import jwt
import bcrypt
from datetime import datetime, timedelta
import json
import logging
from app.config import SECRET_KEY, ALGORITHM, TOKEN_EXPIRATION, USERS_FILE

logger = logging.getLogger(__name__)

def load_users():
    """Загрузка пользователей из файла"""
    try:
        with open(USERS_FILE, "r") as f:
            users = json.load(f)
        logger.debug(f"Загружено {len(users)} пользователей")
        return users
    except Exception as e:
        logger.error(f"Ошибка загрузки пользователей: {e}")
        raise

def save_users(users):
    """Сохранение пользователей в файл"""
    try:
        with open(USERS_FILE, "w") as f:
            json.dump(users, f, indent=2)
        logger.info(f"Сохранено {len(users)} пользователей")
    except Exception as e:
        logger.error(f"Ошибка сохранения пользователей: {e}")
        raise

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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRATION)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Декодирование JWT токена"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
