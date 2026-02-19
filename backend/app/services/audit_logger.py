# app/services/audit_logger.py
"""
Аудит сессий пользователей — запись и чтение событий аутентификации.
Хранение: SQLite.
"""
import sqlite3
import json
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
import logging

from fastapi import Request
from app.config import AUDIT_DB_FILE, AUDIT_LOG_FILE, AUDIT_RETENTION_DAYS

logger = logging.getLogger(__name__)


class AuditLogger:
    def __init__(self, db_file: Path = AUDIT_DB_FILE):
        self.db_file = db_file
        self._lock = threading.Lock()
        self._init_db()
        self._migrate_from_json()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_file), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        self.db_file.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            conn = self._get_conn()
            try:
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS audit_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        username TEXT NOT NULL,
                        ip_address TEXT,
                        user_agent TEXT,
                        jti TEXT,
                        details TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
                    CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_events(username);
                    CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type);
                """)
                conn.commit()
            finally:
                conn.close()

    def _migrate_from_json(self):
        """Импорт записей из старого audit_log.json, если он существует."""
        json_file = AUDIT_LOG_FILE
        if not json_file.exists():
            return
        try:
            with open(json_file, 'r') as f:
                events = json.load(f)
            if not events:
                json_file.rename(json_file.with_suffix('.json.bak'))
                return
            with self._lock:
                conn = self._get_conn()
                try:
                    conn.executemany(
                        "INSERT INTO audit_events (timestamp, event_type, username, ip_address, user_agent, jti, details) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [
                            (
                                e.get("timestamp"),
                                e.get("event_type"),
                                e.get("username"),
                                e.get("ip_address"),
                                e.get("user_agent"),
                                e.get("jti"),
                                e.get("details"),
                            )
                            for e in events
                        ],
                    )
                    conn.commit()
                finally:
                    conn.close()
            json_file.rename(json_file.with_suffix('.json.bak'))
            logger.info(f"Миграция аудита: {len(events)} записей из JSON → SQLite")
        except Exception as e:
            logger.error(f"Ошибка миграции аудита из JSON: {e}")

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
        ts = datetime.now(timezone.utc).isoformat()
        ip = self._get_client_ip(request)
        ua = self._get_user_agent(request)
        try:
            with self._lock:
                conn = self._get_conn()
                try:
                    conn.execute(
                        "INSERT INTO audit_events (timestamp, event_type, username, ip_address, user_agent, jti, details) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (ts, event_type, username, ip, ua, jti, details),
                    )
                    conn.commit()
                finally:
                    conn.close()
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
        conditions = []
        params = []

        if username:
            conditions.append("username = ?")
            params.append(username)
        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        if date_from:
            conditions.append("timestamp >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("timestamp <= ?")
            params.append(date_to + "T23:59:59")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        conn = self._get_conn()
        try:
            total = conn.execute(f"SELECT COUNT(*) FROM audit_events {where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM audit_events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
        finally:
            conn.close()

        items = [dict(row) for row in rows]
        # Убираем id из вывода (его нет в API-контракте)
        for item in items:
            item.pop("id", None)

        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def get_stats(self) -> dict:
        """Агрегированная статистика."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week_ago = (now - timedelta(days=7)).isoformat()

        conn = self._get_conn()
        try:
            total_events = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
            logins_today = conn.execute(
                "SELECT COUNT(*) FROM audit_events WHERE event_type = 'login_success' AND timestamp >= ?",
                (today_start,),
            ).fetchone()[0]
            failed_total = conn.execute(
                "SELECT COUNT(*) FROM audit_events WHERE event_type = 'login_failed'",
            ).fetchone()[0]
            failed_today = conn.execute(
                "SELECT COUNT(*) FROM audit_events WHERE event_type = 'login_failed' AND timestamp >= ?",
                (today_start,),
            ).fetchone()[0]
            unique_users_week = conn.execute(
                "SELECT COUNT(DISTINCT username) FROM audit_events WHERE event_type = 'login_success' AND timestamp >= ?",
                (week_ago,),
            ).fetchone()[0]
        finally:
            conn.close()

        return {
            "total_events": total_events,
            "logins_today": logins_today,
            "unique_users_week": unique_users_week,
            "failed_total": failed_total,
            "failed_today": failed_today,
        }

    def cleanup(self, days: int = AUDIT_RETENTION_DAYS) -> int:
        """Удалить записи старше N дней. Возвращает количество удалённых."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with self._lock:
            conn = self._get_conn()
            try:
                cursor = conn.execute("DELETE FROM audit_events WHERE timestamp < ?", (cutoff,))
                removed = cursor.rowcount
                conn.commit()
            finally:
                conn.close()
        if removed > 0:
            logger.info(f"Audit cleanup: удалено {removed} записей старше {days} дней")
        return removed


audit_logger = AuditLogger()
