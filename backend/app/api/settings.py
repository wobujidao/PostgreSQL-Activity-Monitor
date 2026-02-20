# app/api/settings.py
"""API настроек системы (admin only)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth.dependencies import get_current_user
from app.models.user import User, UserRole
from app.database.repositories import settings_repo

router = APIRouter(prefix="/settings", tags=["settings"])

# Правила валидации
VALIDATION_RULES = {
    "collect_interval":     {"min": 60,  "max": 86400, "label": "Интервал сбора статистики"},
    "size_update_interval": {"min": 300, "max": 86400, "label": "Интервал обновления размеров"},
    "db_check_interval":    {"min": 300, "max": 86400, "label": "Интервал проверки БД"},
    "retention_months":     {"min": 1,   "max": 120,   "label": "Срок хранения данных"},
    "audit_retention_days": {"min": 7,   "max": 3650,  "label": "Срок хранения аудита"},
}


class SettingsUpdate(BaseModel):
    collect_interval: int | None = None
    size_update_interval: int | None = None
    db_check_interval: int | None = None
    retention_months: int | None = None
    audit_retention_days: int | None = None


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return current_user


@router.get("")
async def get_settings(current_user: User = Depends(_require_admin)):
    """Получить все настройки."""
    return await settings_repo.get_all_settings()


@router.put("")
async def update_settings(
    data: SettingsUpdate,
    current_user: User = Depends(_require_admin),
):
    """Обновить настройки."""
    updates = {}
    for field_name, value in data.model_dump(exclude_none=True).items():
        rule = VALIDATION_RULES.get(field_name)
        if rule:
            if value < rule["min"] or value > rule["max"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"{rule['label']}: допустимо от {rule['min']} до {rule['max']}"
                )
        updates[field_name] = str(value)

    if not updates:
        raise HTTPException(status_code=400, detail="Нет данных для обновления")

    return await settings_repo.update_settings(updates)
