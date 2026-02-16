# app/models/ssh_key.py
from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class SSHKeyType(str, Enum):
    RSA = "rsa"
    ED25519 = "ed25519"


class SSHKey(BaseModel):
    """Модель SSH-ключа"""
    id: str
    name: str
    fingerprint: str
    key_type: SSHKeyType
    created_at: datetime
    created_by: str
    public_key: str
    private_key_path: str
    has_passphrase: bool = False
    servers_count: int = 0
    description: str | None = None


class SSHKeyCreate(BaseModel):
    """Модель для создания SSH-ключа"""
    name: str
    key_type: SSHKeyType = SSHKeyType.RSA
    key_size: int | None = 2048  # Только для RSA
    passphrase: str | None = None
    description: str | None = None


class SSHKeyImport(BaseModel):
    """Модель для импорта существующего SSH-ключа"""
    name: str
    private_key: str
    passphrase: str | None = None
    description: str | None = None


class SSHKeyResponse(BaseModel):
    """Модель для ответа API (без приватных данных)"""
    id: str
    name: str
    fingerprint: str
    key_type: SSHKeyType
    created_at: datetime
    created_by: str
    public_key: str
    has_passphrase: bool
    servers_count: int
    description: str | None = None
