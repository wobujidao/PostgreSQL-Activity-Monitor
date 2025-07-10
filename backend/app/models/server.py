# app/models/server.py
from pydantic import BaseModel
from typing import Optional

class Server(BaseModel):
    name: str
    host: str
    stats_db: Optional[str] = None
    user: str
    password: str
    port: int
    ssh_user: str
    ssh_password: str
    ssh_port: int = 22
    # Поля для SSH-аутентификации
    ssh_auth_type: Optional[str] = "password"  # "password" или "key"
    ssh_key_id: Optional[str] = None  # ID ключа из системы управления ключами
    ssh_key_passphrase: Optional[str] = None  # зашифрованный passphrase для ключа
