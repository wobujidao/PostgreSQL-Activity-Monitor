# app/services/ssh_key_storage.py
import os
import json
import uuid
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Tuple
import fcntl
import shutil
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ed25519
from cryptography.hazmat.backends import default_backend

from app.models.ssh_key import SSHKey, SSHKeyCreate, SSHKeyImport, SSHKeyType
from app.config import CONFIG_DIR
from app.utils import encrypt_password, decrypt_password
from app.services.ssh_key_manager import SSHKeyManager

logger = logging.getLogger(__name__)

class SSHKeyStorage:
    """Управление хранением SSH-ключей"""
    
    def __init__(self):
        self.base_dir = CONFIG_DIR
        self.keys_dir = self.base_dir / "ssh_keys"
        self.private_dir = self.keys_dir / "private"
        self.metadata_file = self.keys_dir / "keys.json"
        self.backup_dir = self.keys_dir / "backups"
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Создание необходимых директорий"""
        self.keys_dir.mkdir(parents=True, exist_ok=True)
        self.private_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Установка прав доступа
        os.chmod(self.private_dir, 0o700)
        
        # Создание файла метаданных если не существует
        if not self.metadata_file.exists():
            self._save_metadata([])
    
    def _load_metadata(self) -> List[dict]:
        """Загрузка метаданных ключей"""
        try:
            with open(self.metadata_file, 'r') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_SH)
                try:
                    data = json.load(f)
                    return data
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except Exception as e:
            logger.error(f"Ошибка загрузки метаданных ключей: {e}")
            return []
    
    def _save_metadata(self, metadata: List[dict]):
        """Сохранение метаданных ключей с бэкапом"""
        try:
            # Создаем бэкап если файл существует
            if self.metadata_file.exists():
                backup_file = self.backup_dir / f"keys_{datetime.now():%Y%m%d_%H%M%S}.json"
                shutil.copy2(self.metadata_file, backup_file)
            
            # Сохраняем новую версию
            with open(self.metadata_file, 'w') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    json.dump(metadata, f, indent=2, default=str)
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except Exception as e:
            logger.error(f"Ошибка сохранения метаданных ключей: {e}")
            raise
    
    def list_keys(self) -> List[SSHKey]:
        """Получить список всех ключей"""
        metadata = self._load_metadata()
        keys = []
        
        for key_data in metadata:
            try:
                # Проверяем существование файла приватного ключа
                private_key_path = Path(key_data['private_key_path'])
                if not private_key_path.exists():
                    logger.warning(f"Файл приватного ключа не найден: {private_key_path}")
                    continue
                
                keys.append(SSHKey(**key_data))
            except Exception as e:
                logger.error(f"Ошибка загрузки ключа {key_data.get('id')}: {e}")
        
        return keys
    
    def get_key(self, key_id: str) -> Optional[SSHKey]:
        """Получить ключ по ID"""
        metadata = self._load_metadata()
        
        for key_data in metadata:
            if key_data.get('id') == key_id:
                try:
                    return SSHKey(**key_data)
                except Exception as e:
                    logger.error(f"Ошибка загрузки ключа {key_id}: {e}")
                    return None
        
        return None
    
    def create_key(self, key_create: SSHKeyCreate, created_by: str) -> SSHKey:
        """Создать новый SSH-ключ"""
        # Генерируем ID и путь к файлу
        key_id = str(uuid.uuid4())
        private_key_filename = f"key_{key_id}.pem"
        private_key_path = self.private_dir / private_key_filename
        
        try:
            # Генерируем пару ключей
            if key_create.key_type == SSHKeyType.RSA:
                private_key_pem, public_key_str, fingerprint = SSHKeyManager.generate_ssh_key_pair(
                    key_type="rsa",
                    key_size=key_create.key_size or 2048,
                    passphrase=key_create.passphrase
                )
            else:
                private_key_pem, public_key_str, fingerprint = SSHKeyManager.generate_ssh_key_pair(
                    key_type="ed25519",
                    passphrase=key_create.passphrase
                )
            
            # Шифруем приватный ключ перед сохранением
            encrypted_private_key = encrypt_password(private_key_pem)
            
            # Сохраняем приватный ключ
            with open(private_key_path, 'w') as f:
                f.write(encrypted_private_key)
            os.chmod(private_key_path, 0o600)
            
            # Создаем объект ключа
            ssh_key = SSHKey(
                id=key_id,
                name=key_create.name,
                fingerprint=fingerprint,
                key_type=key_create.key_type,
                created_at=datetime.now(),
                created_by=created_by,
                public_key=public_key_str,
                private_key_path=str(private_key_path),
                has_passphrase=bool(key_create.passphrase),
                servers_count=0,
                description=key_create.description
            )
            
            # Добавляем в метаданные
            metadata = self._load_metadata()
            metadata.append(ssh_key.dict())
            self._save_metadata(metadata)
            
            logger.info(f"Создан SSH-ключ: {ssh_key.name} (ID: {key_id})")
            return ssh_key
            
        except Exception as e:
            # Удаляем файл если что-то пошло не так
            if private_key_path.exists():
                os.unlink(private_key_path)
            logger.error(f"Ошибка создания SSH-ключа: {e}")
            raise
    
    def import_key(self, key_import: SSHKeyImport, created_by: str) -> SSHKey:
        """Импортировать существующий SSH-ключ"""
        # Валидируем ключ
        is_valid, error_msg, fingerprint = SSHKeyManager.validate_private_key(
            key_import.private_key,
            key_import.passphrase
        )
        
        if not is_valid:
            raise ValueError(f"Невалидный приватный ключ: {error_msg}")
        
        # Определяем тип ключа
        key_type = self._detect_key_type(key_import.private_key)
        
        # Получаем публичный ключ
        public_key = SSHKeyManager.get_public_key_from_private(
            key_import.private_key,
            key_import.passphrase
        )
        
        if not public_key:
            raise ValueError("Не удалось извлечь публичный ключ")
        
        # Генерируем ID и путь к файлу
        key_id = str(uuid.uuid4())
        private_key_filename = f"key_{key_id}.pem"
        private_key_path = self.private_dir / private_key_filename
        
        try:
            # Шифруем приватный ключ перед сохранением
            encrypted_private_key = encrypt_password(key_import.private_key)
            
            # Сохраняем приватный ключ
            with open(private_key_path, 'w') as f:
                f.write(encrypted_private_key)
            os.chmod(private_key_path, 0o600)
            
            # Создаем объект ключа
            ssh_key = SSHKey(
                id=key_id,
                name=key_import.name,
                fingerprint=fingerprint,
                key_type=key_type,
                created_at=datetime.now(),
                created_by=created_by,
                public_key=public_key,
                private_key_path=str(private_key_path),
                has_passphrase=bool(key_import.passphrase),
                servers_count=0,
                description=key_import.description
            )
            
            # Добавляем в метаданные
            metadata = self._load_metadata()
            metadata.append(ssh_key.dict())
            self._save_metadata(metadata)
            
            logger.info(f"Импортирован SSH-ключ: {ssh_key.name} (ID: {key_id})")
            return ssh_key
            
        except Exception as e:
            # Удаляем файл если что-то пошло не так
            if private_key_path.exists():
                os.unlink(private_key_path)
            logger.error(f"Ошибка импорта SSH-ключа: {e}")
            raise
    
    def update_key(self, key_id: str, updates: dict) -> Optional[SSHKey]:
        """Обновить информацию о SSH-ключе"""
        metadata = self._load_metadata()
        
        # Находим ключ
        key_index = None
        for idx, key_data in enumerate(metadata):
            if key_data.get('id') == key_id:
                key_index = idx
                break
        
        if key_index is None:
            return None
        
        # Обновляем поля
        for field, value in updates.items():
            metadata[key_index][field] = value
        
        # Сохраняем метаданные
        self._save_metadata(metadata)
        
        logger.info(f"Обновлен SSH-ключ {key_id}: {updates}")
        return SSHKey(**metadata[key_index])
    
    def delete_key(self, key_id: str) -> bool:
        """Удалить SSH-ключ"""
        metadata = self._load_metadata()
        
        # Находим ключ
        key_data = None
        for idx, kd in enumerate(metadata):
            if kd.get('id') == key_id:
                key_data = kd
                metadata.pop(idx)
                break
        
        if not key_data:
            return False
        
        # Проверяем что ключ не используется
        if key_data.get('servers_count', 0) > 0:
            raise ValueError(f"Ключ используется на {key_data['servers_count']} серверах")
        
        # Удаляем файл приватного ключа
        try:
            private_key_path = Path(key_data['private_key_path'])
            if private_key_path.exists():
                os.unlink(private_key_path)
        except Exception as e:
            logger.error(f"Ошибка удаления файла ключа: {e}")
        
        # Сохраняем метаданные
        self._save_metadata(metadata)
        
        logger.info(f"Удален SSH-ключ: {key_data.get('name')} (ID: {key_id})")
        return True
    
    def get_private_key_content(self, key_id: str, passphrase: Optional[str] = None) -> Tuple[str, Optional[str]]:
        """Получить расшифрованное содержимое приватного ключа"""
        key = self.get_key(key_id)
        if not key:
            raise ValueError(f"Ключ {key_id} не найден")
        
        # Читаем зашифрованный ключ
        with open(key.private_key_path, 'r') as f:
            encrypted_content = f.read()
        
        # Расшифровываем
        private_key_content = decrypt_password(encrypted_content)
        
        # Если ключ защищен паролем, нужен passphrase
        if key.has_passphrase and not passphrase:
            raise ValueError("Ключ защищен паролем, но пароль не предоставлен")
        
        return private_key_content, passphrase if key.has_passphrase else None
    
    def update_servers_count(self, key_id: str, count: int):
        """Обновить количество серверов использующих ключ"""
        metadata = self._load_metadata()
        
        for key_data in metadata:
            if key_data.get('id') == key_id:
                key_data['servers_count'] = count
                self._save_metadata(metadata)
                return
    
    def _detect_key_type(self, private_key_content: str) -> SSHKeyType:
        """Определить тип ключа по содержимому"""
        if "BEGIN RSA PRIVATE KEY" in private_key_content or "BEGIN PRIVATE KEY" in private_key_content:
            return SSHKeyType.RSA
        elif "BEGIN OPENSSH PRIVATE KEY" in private_key_content:
            # Дополнительная проверка для Ed25519
            if "ssh-ed25519" in private_key_content:
                return SSHKeyType.ED25519
            else:
                return SSHKeyType.RSA
        else:
            # По умолчанию считаем RSA
            return SSHKeyType.RSA

# Глобальный экземпляр
ssh_key_storage = SSHKeyStorage()
