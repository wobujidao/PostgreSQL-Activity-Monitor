# app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import logging
from app.auth import verify_password, create_access_token, load_users
from app.config import TOKEN_EXPIRATION

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])

@router.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Авторизация и получение токена"""
    users = load_users()
    for user in users:
        if user["login"] == form_data.username and verify_password(form_data.password, user["password"]):
            token = create_access_token({"sub": user["login"]}, timedelta(minutes=TOKEN_EXPIRATION))
            logger.info(f"Успешная авторизация: {user['login']}")
            return {"access_token": token, "token_type": "bearer"}
    
    logger.warning(f"Неудачная попытка авторизации: {form_data.username}")
    raise HTTPException(status_code=401, detail="Invalid credentials")
