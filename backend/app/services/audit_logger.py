# app/services/audit_logger.py
"""
Аудит сессий пользователей — запись и чтение событий аутентификации.
Хранение: JSON-файл с файловой блокировкой (fcntl).
"""
import json
import fcntl
from datetime import datetime, timezone, timedelta
from pathlib import Path
import logging

from fastapi import Request
from app.config import AUDIT_LOG_FILE, AUDIT_RETENTION_DAYS

logger = logging.getLogger(__name__)


class AuditLogger:
    def __init__(self, log_file: Path = AUDIT_LOG_FILE):
        self.log_file = log_file
        self._ensure_file()

    def _ensure_file(self):
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.log_file.exists():
            with open(self.log_file, 'w') as f:
                json.dump([], f)

    def _get_client_ip(self, request: Request) -> str:
        """Извлечь реальный IP клиента (X-Real-IP от nginx или client.host)."""
        return (
            request.headers.get("x-real-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )

    def _get_user_agent(self, request: Request) -> str:
        return request.headers.get("user-agent", "unknown")

    def log_event(
        self,
        event_type: str,
        username: str,
        request: Request,
        jti: str | None = None,
        details: str | None = None,
    ) -> None:
        """Записать событие аудита."""
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "username": username,
            "ip_address": self._get_client_ip(request),
            "user_agent": self._get_user_agent(request),
            "jti": jti,
            "details": details,
        }
        try:
            events = self._load()
            events.append(event)
            self._save(events)
            logger.debug(f"Audit: {event_type} — {username}")
        except Exception as e:
            logger.error(f"Ошибка записи аудита: {e}")

    def get_events(
        self,
        limit: int = 50,
        offset: int = 0,
        username: str | None = None,
        event_type: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> dict:
        """Получить события с фильтрацией и пагинацией."""
        events = self._load()

        # Фильтрация
        if username:
            events = [e for e in events if e.get("username") == username]
        if event_type:
            events = [e for e in events if e.get("event_type") == event_type]
        if date_from:
            events = [e for e in events if e.get("timestamp", "") >= date_from]
        if date_to:
            # date_to включительно — добавляем день
            events = [e for e in events if e.get("timestamp", "") <= date_to + "T23:59:59"]

        # Сортировка: новые сверху
        events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)

        total = len(events)
        items = events[offset:offset + limit]

        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def get_stats(self) -> dict:
        """Агрегированная статистика."""
        events = self._load()
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week_ago = (now - timedelta(days=7)).isoformat()

        logins_today = sum(
            1 for e in events
            if e.get("event_type") == "login_success" and e.get("timestamp", "") >= today_start
        )
        failed_total = sum(1 for e in events if e.get("event_type") == "login_failed")
        failed_today = sum(
            1 for e in events
            if e.get("event_type") == "login_failed" and e.get("timestamp", "") >= today_start
        )
        unique_users_week = len(set(
            e.get("username") for e in events
            if e.get("event_type") == "login_success" and e.get("timestamp", "") >= week_ago
        ))

        return {
            "total_events": len(events),
            "logins_today": logins_today,
            "unique_users_week": unique_users_week,
            "failed_total": failed_total,
            "failed_today": failed_today,
        }

    def cleanup(self, days: int = AUDIT_RETENTION_DAYS) -> int:
        """Удалить записи старше N дней. Возвращает количество удалённых."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        events = self._load()
        original = len(events)
        events = [e for e in events if e.get("timestamp", "") >= cutoff]
        removed = original - len(events)
        if removed > 0:
            self._save(events)
            logger.info(f"Audit cleanup: удалено {removed} записей старше {days} дней")
        return removed

    def _load(self) -> list[dict]:
        try:
            with open(self.log_file, 'r') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_SH)
                try:
                    return json.load(f)
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _save(self, events: list[dict]):
        with open(self.log_file, 'w') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                json.dump(events, f, indent=2, ensure_ascii=False)
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)


audit_logger = AuditLogger()
