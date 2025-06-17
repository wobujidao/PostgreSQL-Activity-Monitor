# app/utils/crypto.py
from cryptography.fernet import Fernet
from app.config import ENCRYPTION_KEY_FILE
import logging

logger = logging.getLogger(__name__)

# Загрузка ключа шифрования
try:
    with open(ENCRYPTION_KEY_FILE, "rb") as key_file:
        fernet = Fernet(key_file.read())
    logger.info("Ключ шифрования успешно загружен")
except Exception as e:
    logger.error(f"Критическая ошибка: не удалось загрузить ключ шифрования: {e}")
    raise Exception(f"Ошибка загрузки ключа шифрования: {e}")

def encrypt_password(password: str) -> str:
    """Зашифровать пароль"""
    return fernet.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Расшифровать пароль"""
    return fernet.decrypt(encrypted_password.encode()).decode()
