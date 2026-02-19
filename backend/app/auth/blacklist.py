# app/auth/blacklist.py
"""
In-memory blacklist для отозванных JWT токенов.
Хранит jti → expiration timestamp. Thread-safe через Lock.
"""
import threading
import time
import logging

logger = logging.getLogger(__name__)


class TokenBlacklist:
    def __init__(self):
        self._blacklist: dict[str, float] = {}  # jti -> exp_timestamp
        self._lock = threading.Lock()

    def add(self, jti: str, exp: float) -> None:
        """Добавить токен в blacklist. exp — Unix timestamp истечения."""
        with self._lock:
            self._blacklist[jti] = exp
            logger.debug(f"Токен {jti[:8]}... добавлен в blacklist")

    def is_blacklisted(self, jti: str) -> bool:
        """Проверить, отозван ли токен."""
        with self._lock:
            return jti in self._blacklist

    def cleanup(self) -> int:
        """Удалить истёкшие записи. Возвращает количество удалённых."""
        now = time.time()
        with self._lock:
            expired = [jti for jti, exp in self._blacklist.items() if exp < now]
            for jti in expired:
                del self._blacklist[jti]
        if expired:
            logger.info(f"Blacklist cleanup: удалено {len(expired)} истёкших токенов")
        return len(expired)

    def __len__(self) -> int:
        with self._lock:
            return len(self._blacklist)


token_blacklist = TokenBlacklist()
