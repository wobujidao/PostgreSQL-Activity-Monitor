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
    if not password:
        return password
    return fernet.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Расшифровать пароль"""
    if not encrypted_password:
        return encrypted_password
    return fernet.decrypt(encrypted_password.encode()).decode()

def is_encrypted(value: str) -> bool:
    """Проверяет, зашифровано ли значение"""
    return value and isinstance(value, str) and value.startswith('gAAAAA')

def ensure_encrypted(value: str) -> str:
    """Шифрует значение только если оно еще не зашифровано"""
    if not value:
        return value
    return value if is_encrypted(value) else encrypt_password(value)

def ensure_decrypted(value: str) -> str:
    """Расшифровывает значение только если оно зашифровано"""
    if not value:
        return value
    return decrypt_password(value) if is_encrypted(value) else value

def fix_double_encryption(value: str) -> str:
    """Исправляет двойное шифрование, возвращая правильно зашифрованное значение"""
    if not value or not is_encrypted(value):
        return value
    
    try:
        # Расшифровываем первый раз
        decrypted_once = decrypt_password(value)
        
        # Проверяем, не зашифровано ли еще раз
        if is_encrypted(decrypted_once):
            logger.warning("Обнаружено двойное шифрование!")
            # Расшифровываем второй раз, чтобы получить оригинал
            original = decrypt_password(decrypted_once)
            # Возвращаем правильно зашифрованное значение
            return encrypt_password(original)
        else:
            # Все нормально, возвращаем как есть
            return value
    except Exception as e:
        logger.error(f"Ошибка при исправлении двойного шифрования: {e}")
        return value
