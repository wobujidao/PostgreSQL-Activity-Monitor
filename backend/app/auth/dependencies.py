# app/auth/dependencies.py
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import jwt
import logging
from app.auth.utils import load_users, decode_token
from app.auth.blacklist import token_blacklist
from app.models.user import User

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Получение текущего пользователя из токена"""
    try:
        payload = decode_token(token)
        username = payload.get("sub")

        # Проверка типа токена (только access)
        token_type = payload.get("type")
        if token_type and token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        # Проверка blacklist
        jti = payload.get("jti")
        if jti and token_blacklist.is_blacklisted(jti):
            raise HTTPException(status_code=401, detail="Token revoked")

        users = load_users()
        for user_data in users:
            if user_data["login"] == username:
                logger.debug(f"Авторизован пользователь: {username}")
                return User(**user_data)

        raise HTTPException(status_code=401, detail="Invalid credentials")
    except jwt.ExpiredSignatureError:
        logger.warning("Попытка использования истёкшего токена")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        logger.warning("Попытка использования невалидного токена")
        raise HTTPException(status_code=401, detail="Invalid token")
