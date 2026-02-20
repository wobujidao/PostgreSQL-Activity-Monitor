# app/services/ssh_key_storage.py
"""Управление SSH-ключами через PostgreSQL."""
import uuid
import logging
from datetime import datetime, timezone

from app.models.ssh_key import SSHKey, SSHKeyCreate, SSHKeyImport, SSHKeyType
from app.database.repositories import ssh_key_repo
from app.services.ssh_key_manager import SSHKeyManager

logger = logging.getLogger(__name__)


def _repo_to_model(data: dict) -> SSHKey:
    """Convert repo dict to SSHKey model, adding missing fields."""
    data.setdefault("private_key_path", "")  # deprecated, in DB now
    data.setdefault("servers_count", 0)
    return SSHKey(**data)


async def list_keys() -> list[SSHKey]:
    """Получить список всех SSH-ключей."""
    rows = await ssh_key_repo.list_keys()
    result = []
    for r in rows:
        # Add servers_count from DB
        r["servers_count"] = await ssh_key_repo.get_servers_count(r["id"])
        result.append(_repo_to_model(r))
    return result


async def get_key(key_id: str) -> SSHKey | None:
    """Получить ключ по ID."""
    data = await ssh_key_repo.get_key(key_id)
    if not data:
        return None
    data["servers_count"] = await ssh_key_repo.get_servers_count(key_id)
    return _repo_to_model(data)


async def create_key(key_create: SSHKeyCreate, created_by: str) -> SSHKey:
    """Сгенерировать новый SSH-ключ."""
    key_id = str(uuid.uuid4())

    # Generate key pair
    if key_create.key_type == SSHKeyType.RSA:
        private_key_pem, public_key_str, fingerprint = SSHKeyManager.generate_ssh_key_pair(
            key_type="rsa", key_size=key_create.key_size or 2048, passphrase=key_create.passphrase
        )
    else:
        private_key_pem, public_key_str, fingerprint = SSHKeyManager.generate_ssh_key_pair(
            key_type="ed25519", passphrase=key_create.passphrase
        )

    data = await ssh_key_repo.create_key(
        id=key_id, name=key_create.name, fingerprint=fingerprint,
        key_type=key_create.key_type.value, public_key=public_key_str,
        private_key_pem=private_key_pem, created_by=created_by,
        has_passphrase=bool(key_create.passphrase), description=key_create.description,
    )
    logger.info(f"Создан SSH-ключ: {key_create.name} (ID: {key_id})")
    return _repo_to_model(data)


async def import_key(key_import: SSHKeyImport, created_by: str) -> SSHKey:
    """Импортировать существующий SSH-ключ."""
    # Validate key
    is_valid, error_msg, fingerprint = SSHKeyManager.validate_private_key(
        key_import.private_key, key_import.passphrase
    )
    if not is_valid:
        raise ValueError(f"Невалидный приватный ключ: {error_msg}")

    # Detect key type
    key_type = _detect_key_type(key_import.private_key)

    # Get public key
    public_key = SSHKeyManager.get_public_key_from_private(
        key_import.private_key, key_import.passphrase
    )
    if not public_key:
        raise ValueError("Не удалось извлечь публичный ключ")

    key_id = str(uuid.uuid4())
    data = await ssh_key_repo.create_key(
        id=key_id, name=key_import.name, fingerprint=fingerprint,
        key_type=key_type.value, public_key=public_key,
        private_key_pem=key_import.private_key, created_by=created_by,
        has_passphrase=bool(key_import.passphrase), description=key_import.description,
    )
    logger.info(f"Импортирован SSH-ключ: {key_import.name} (ID: {key_id})")
    return _repo_to_model(data)


async def update_key(key_id: str, updates: dict) -> SSHKey | None:
    """Обновить информацию о SSH-ключе."""
    data = await ssh_key_repo.update_key(
        key_id,
        name=updates.get("name"),
        description=updates.get("description"),
    )
    if not data:
        return None
    data["servers_count"] = await ssh_key_repo.get_servers_count(key_id)
    return _repo_to_model(data)


async def delete_key(key_id: str) -> bool:
    """Удалить SSH-ключ."""
    return await ssh_key_repo.delete_key(key_id)


async def get_private_key_content(key_id: str, passphrase: str | None = None) -> tuple[str, str | None]:
    """Получить расшифрованное содержимое приватного ключа."""
    key = await get_key(key_id)
    if not key:
        raise ValueError(f"Ключ {key_id} не найден")

    private_key_content = await ssh_key_repo.get_private_key_content(key_id)
    if not private_key_content:
        raise ValueError(f"Приватный ключ {key_id} не найден в БД")

    if key.has_passphrase and not passphrase:
        raise ValueError("Ключ защищен паролем, но пароль не предоставлен")

    return private_key_content, passphrase if key.has_passphrase else None


def _detect_key_type(private_key_content: str) -> SSHKeyType:
    """Определить тип ключа по содержимому."""
    if "BEGIN RSA PRIVATE KEY" in private_key_content or "BEGIN PRIVATE KEY" in private_key_content:
        return SSHKeyType.RSA
    elif "BEGIN OPENSSH PRIVATE KEY" in private_key_content:
        if "ssh-ed25519" in private_key_content:
            return SSHKeyType.ED25519
        return SSHKeyType.RSA
    return SSHKeyType.RSA
