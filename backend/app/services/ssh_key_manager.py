# app/services/ssh_key_manager.py
import os
import tempfile
import logging
import paramiko
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ed25519
from cryptography.hazmat.backends import default_backend
import hashlib
import base64

logger = logging.getLogger(__name__)

class SSHKeyManager:
    """Менеджер для работы с SSH-ключами"""
    
    @staticmethod
    def generate_ssh_key_pair(key_type: str = "rsa", key_size: int = 2048, passphrase: str = None) -> tuple[str, str, str]:
        """
        Генерирует пару SSH-ключей
        
        Args:
            key_type: Тип ключа ("rsa" или "ed25519")
            key_size: Размер ключа (только для RSA)
            passphrase: Пароль для защиты приватного ключа
            
        Returns:
            Tuple[private_key, public_key, fingerprint]
        """
        try:
            if key_type.lower() == "rsa":
                # Генерация RSA ключа
                private_key_obj = rsa.generate_private_key(
                    public_exponent=65537,
                    key_size=key_size,
                    backend=default_backend()
                )
            elif key_type.lower() == "ed25519":
                # Генерация Ed25519 ключа
                private_key_obj = ed25519.Ed25519PrivateKey.generate()
            else:
                raise ValueError(f"Неподдерживаемый тип ключа: {key_type}")
            
            # Кодирование приватного ключа
            encryption_algorithm = serialization.NoEncryption()
            if passphrase:
                encryption_algorithm = serialization.BestAvailableEncryption(passphrase.encode())
            
            private_key = private_key_obj.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.OpenSSH,
                encryption_algorithm=encryption_algorithm
            ).decode('utf-8')
            
            # Получение публичного ключа
            public_key_obj = private_key_obj.public_key()
            public_key = public_key_obj.public_bytes(
                encoding=serialization.Encoding.OpenSSH,
                format=serialization.PublicFormat.OpenSSH
            ).decode('utf-8')
            
            # Добавляем комментарий к публичному ключу
            public_key = f"{public_key} pgmon@activity-monitor"
            
            # Вычисление fingerprint
            fingerprint = SSHKeyManager.calculate_fingerprint(public_key)
            
            logger.info(f"Сгенерирована пара SSH-ключей типа {key_type}")
            return private_key, public_key, fingerprint
            
        except Exception as e:
            logger.error(f"Ошибка генерации SSH-ключей: {e}")
            raise
    
    @staticmethod
    def validate_private_key(private_key_content: str, passphrase: str = None) -> tuple[bool, str | None, str | None]:
        """
        Валидирует приватный SSH-ключ
        
        Args:
            private_key_content: Содержимое приватного ключа
            passphrase: Пароль от ключа (если есть)
            
        Returns:
            Tuple[is_valid, error_message, fingerprint]
        """
        try:
            # Пытаемся загрузить ключ через paramiko
            key = None
            
            # Создаем временный файл для ключа
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.key') as tmp_file:
                os.chmod(tmp_file.name, 0o600)
                tmp_file.write(private_key_content)
                tmp_file_path = tmp_file.name
            
            try:
                # Пробуем разные типы ключей
                for key_class in [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey]:
                    try:
                        key = key_class.from_private_key_file(tmp_file_path, password=passphrase)
                        break
                    except Exception:
                        continue
                
                if not key:
                    return False, "Не удалось распознать тип ключа или неверный формат", None
                
                # Получаем публичный ключ и fingerprint
                public_key = f"{key.get_name()} {key.get_base64()}"
                fingerprint = SSHKeyManager.calculate_fingerprint(public_key)
                
                return True, None, fingerprint
                
            finally:
                # Удаляем временный файл
                os.unlink(tmp_file_path)
                
        except paramiko.PasswordRequiredException:
            return False, "Ключ защищен паролем, но пароль не указан или неверный", None
        except Exception as e:
            logger.error(f"Ошибка валидации ключа: {e}")
            return False, f"Ошибка валидации: {str(e)}", None
    
    @staticmethod
    def calculate_fingerprint(public_key: str) -> str:
        """
        Вычисляет SHA256 fingerprint публичного ключа
        
        Args:
            public_key: Публичный ключ в формате OpenSSH
            
        Returns:
            Fingerprint в формате SHA256:base64
        """
        try:
            # Извлекаем base64 часть ключа
            parts = public_key.strip().split()
            if len(parts) < 2:
                raise ValueError("Неверный формат публичного ключа")
            
            key_data = base64.b64decode(parts[1])
            
            # Вычисляем SHA256
            digest = hashlib.sha256(key_data).digest()
            fingerprint = base64.b64encode(digest).decode('utf-8')
            
            # Убираем trailing '='
            fingerprint = fingerprint.rstrip('=')
            
            return f"SHA256:{fingerprint}"
            
        except Exception as e:
            logger.error(f"Ошибка вычисления fingerprint: {e}")
            return "unknown"
    
    @staticmethod
    def get_public_key_from_private(private_key_content: str, passphrase: str = None) -> str | None:
        """
        Извлекает публичный ключ из приватного
        
        Args:
            private_key_content: Содержимое приватного ключа
            passphrase: Пароль от ключа
            
        Returns:
            Публичный ключ или None
        """
        try:
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.key') as tmp_file:
                os.chmod(tmp_file.name, 0o600)
                tmp_file.write(private_key_content)
                tmp_file_path = tmp_file.name
            
            try:
                # Пробуем разные типы ключей
                for key_class in [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey]:
                    try:
                        key = key_class.from_private_key_file(tmp_file_path, password=passphrase)
                        public_key = f"{key.get_name()} {key.get_base64()} pgmon@activity-monitor"
                        return public_key
                    except Exception:
                        continue
                
                return None
                
            finally:
                os.unlink(tmp_file_path)
                
        except Exception as e:
            logger.error(f"Ошибка извлечения публичного ключа: {e}")
            return None
    
    @staticmethod
    def test_ssh_connection(host: str, port: int, username: str,
                          private_key_content: str = None,
                          passphrase: str = None,
                          password: str = None) -> tuple[bool, str]:
        """
        Тестирует SSH-подключение
        
        Returns:
            Tuple[success, message]
        """
        ssh = None
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            connect_kwargs = {
                'hostname': host,
                'port': port,
                'username': username,
                'timeout': 10,
                'banner_timeout': 10,
                'auth_timeout': 10
            }
            
            if private_key_content:
                # Подключение по ключу
                with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.key') as tmp_file:
                    os.chmod(tmp_file.name, 0o600)
                    tmp_file.write(private_key_content)
                    tmp_file_path = tmp_file.name
                
                try:
                    # Пробуем загрузить ключ
                    pkey = None
                    for key_class in [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey]:
                        try:
                            pkey = key_class.from_private_key_file(tmp_file_path, password=passphrase)
                            break
                        except Exception:
                            continue

                    if not pkey:
                        return False, "Не удалось загрузить приватный ключ"
                    
                    connect_kwargs['pkey'] = pkey
                    
                finally:
                    os.unlink(tmp_file_path)
            else:
                # Подключение по паролю
                connect_kwargs['password'] = password
            
            ssh.connect(**connect_kwargs)
            
            # Выполняем тестовую команду
            stdin, stdout, stderr = ssh.exec_command('echo "SSH connection test successful"')
            output = stdout.read().decode().strip()
            
            if "SSH connection test successful" in output:
                return True, "Подключение успешно установлено"
            else:
                return False, f"Неожиданный ответ: {output}"
                
        except paramiko.AuthenticationException:
            return False, "Ошибка аутентификации. Проверьте учетные данные"
        except paramiko.SSHException as e:
            return False, f"SSH ошибка: {str(e)}"
        except Exception as e:
            return False, f"Ошибка подключения: {str(e)}"
        finally:
            if ssh:
                ssh.close()
