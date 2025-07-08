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
    # Новые поля для SSH-ключей
    ssh_auth_type: Optional[str] = "password"  # "password" или "key"
    ssh_private_key: Optional[str] = None  # зашифрованное содержимое ключа
    ssh_key_passphrase: Optional[str] = None  # зашифрованный passphrase
    ssh_key_fingerprint: Optional[str] = None  # для отображения в UI
