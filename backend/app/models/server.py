# app/models/server.py
from pydantic import BaseModel


class Server(BaseModel):
    name: str
    host: str
    stats_db: str | None = None
    user: str
    password: str
    port: int
    ssh_user: str
    ssh_password: str
    ssh_port: int = 22
    # Поля для SSH-аутентификации
    ssh_auth_type: str | None = "password"  # "password" или "key"
    ssh_key_id: str | None = None  # ID ключа из системы управления ключами
    ssh_key_passphrase: str | None = None  # зашифрованный passphrase для ключа
