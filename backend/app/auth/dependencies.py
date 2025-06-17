# app/auth/dependencies.py
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import jwt
import logging
from app.auth.utils import load_users, decode_token

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Получение текущего пользователя из токена"""
    try:
        payload = decode_token(token)
        username = payload.get("sub")
        users = load_users()
        for user in users:
            if user["login"] == username:
                logger.debug(f"Авторизован пользователь: {username}")
                return user
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except jwt.ExpiredSignatureError:
        logger.warning("Попытка использования истёкшего токена")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        logger.warning("Попытка использования невалидного токена")
        raise HTTPException(status_code=401, detail="Invalid token")
