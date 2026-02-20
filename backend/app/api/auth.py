# app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import jwt
import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.auth import (
    verify_password, create_access_token, create_refresh_token,
    decode_token, load_users, get_current_user, oauth2_scheme,
    token_blacklist,
)
from app.config import TOKEN_EXPIRATION, REFRESH_TOKEN_EXPIRATION_DAYS, ALLOWED_ORIGINS
from app.services import audit_logger, user_manager

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60  # секунд


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Установить httpOnly cookie с refresh token."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=REFRESH_COOKIE_MAX_AGE,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Удалить refresh cookie."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )


def _check_origin(request: Request) -> None:
    """Проверка Origin header для защиты от CSRF."""
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        logger.warning(f"Отклонён запрос с Origin: {origin}")
        raise HTTPException(status_code=403, detail="Invalid origin")


@router.post("/token")
@limiter.limit("5/minute")
async def login(request: Request, response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    """Авторизация: access token в JSON, refresh token в httpOnly cookie."""
    users = await load_users()
    for user in users:
        if user["login"] == form_data.username and verify_password(form_data.password, user["password"]):
            access_token = create_access_token(
                {"sub": user["login"]},
                timedelta(minutes=TOKEN_EXPIRATION),
            )
            refresh_token = create_refresh_token(
                {"sub": user["login"]},
                timedelta(days=REFRESH_TOKEN_EXPIRATION_DAYS),
            )
            _set_refresh_cookie(response, refresh_token)
            logger.info(f"Успешная авторизация: {user['login']}")
            # Извлекаем jti из access token для аудита
            access_payload = decode_token(access_token)
            await audit_logger.log_event("login_success", user["login"], request, jti=access_payload.get("jti"))
            await user_manager.update_last_login(user["login"])
            return {"access_token": access_token, "token_type": "bearer"}

    logger.warning(f"Неудачная попытка авторизации: {form_data.username}")
    await audit_logger.log_event("login_failed", form_data.username, request, details="Неверный логин или пароль")
    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/refresh")
@limiter.limit("10/minute")
async def refresh(request: Request, response: Response, refresh_token: str | None = Cookie(default=None)):
    """Обновление access token по refresh cookie. Ротация refresh token."""
    _check_origin(request)

    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = decode_token(refresh_token)
    except jwt.ExpiredSignatureError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Проверка типа
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    # Проверка blacklist
    old_jti = payload.get("jti")
    if old_jti and token_blacklist.is_blacklisted(old_jti):
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    # Проверка что пользователь ещё активен
    username = payload.get("sub")
    users = await load_users()
    user_found = None
    for user in users:
        if user["login"] == username:
            user_found = user
            break
    if not user_found:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="User not found")

    # Ротация: старый refresh в blacklist
    if old_jti:
        token_blacklist.add(old_jti, payload.get("exp", 0))

    # Новые токены
    new_access = create_access_token(
        {"sub": username},
        timedelta(minutes=TOKEN_EXPIRATION),
    )
    new_refresh = create_refresh_token(
        {"sub": username},
        timedelta(days=REFRESH_TOKEN_EXPIRATION_DAYS),
    )
    _set_refresh_cookie(response, new_refresh)

    logger.info(f"Refresh token для {username}")
    new_access_payload = decode_token(new_access)
    await audit_logger.log_event("refresh", username, request, jti=new_access_payload.get("jti"))
    return {"access_token": new_access, "token_type": "bearer"}


@router.post("/logout")
async def logout(request: Request, response: Response, refresh_token: str | None = Cookie(default=None)):
    """Выход: blacklist access и refresh токенов, удаление cookie."""
    # Blacklist access token (из Authorization header)
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        access_token_str = auth_header[7:]
        try:
            access_payload = decode_token(access_token_str)
            access_jti = access_payload.get("jti")
            if access_jti:
                token_blacklist.add(access_jti, access_payload.get("exp", 0))
        except jwt.InvalidTokenError:
            pass  # Токен уже невалиден — ничего страшного

    # Blacklist refresh token (из cookie)
    if refresh_token:
        try:
            refresh_payload = decode_token(refresh_token)
            refresh_jti = refresh_payload.get("jti")
            if refresh_jti:
                token_blacklist.add(refresh_jti, refresh_payload.get("exp", 0))
        except jwt.InvalidTokenError:
            pass

    # Определяем username для аудита
    logout_username = "unknown"
    if auth_header.startswith("Bearer "):
        try:
            p = decode_token(auth_header[7:])
            logout_username = p.get("sub", "unknown")
        except jwt.InvalidTokenError:
            pass
    if logout_username == "unknown" and refresh_token:
        try:
            p = decode_token(refresh_token)
            logout_username = p.get("sub", "unknown")
        except jwt.InvalidTokenError:
            pass

    _clear_refresh_cookie(response)
    await audit_logger.log_event("logout", logout_username, request)
    logger.info(f"Logout выполнен: {logout_username}")
    return {"detail": "Logged out"}
