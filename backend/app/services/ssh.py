# app/services/ssh.py
import paramiko
import socket
import logging
import tempfile
import os
from typing import Tuple, Optional
from app.models import Server
from app.services.cache import cache_manager
from app.config import SSH_CACHE_TTL
from app.utils import decrypt_password

logger = logging.getLogger(__name__)

def is_host_reachable(host: str, port: int, timeout: int = 2) -> bool:
    """Проверка доступности хоста с улучшенной обработкой"""
    try:
        # Проверяем валидность хоста
        if not host or host.lower() in ['test', 'localhost', '127.0.0.1']:
            logger.debug(f"Невалидный хост: {host}")
            return False
            
        # Пытаемся резолвить DNS
        try:
            ip = socket.gethostbyname(host)
            logger.debug(f"DNS резолвинг {host} -> {ip}")
        except socket.gaierror:
            logger.warning(f"DNS не может разрешить хост {host}")
            return False
        
        # Проверяем доступность порта
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            result = sock.connect_ex((host, port))
            return result == 0
        finally:
            sock.close()
            
    except Exception as e:
        logger.error(f"Ошибка проверки доступности {host}:{port}: {e}")
        return False

def get_ssh_client(server: Server) -> paramiko.SSHClient:
    """Создает и настраивает SSH-клиент для сервера"""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    connect_kwargs = {
        'hostname': server.host,
        'port': server.ssh_port,
        'username': server.ssh_user,
        'timeout': 5,
        'banner_timeout': 5,
        'auth_timeout': 5
    }
    
    # Определяем метод аутентификации
    if getattr(server, 'ssh_auth_type', 'password') == 'key' and getattr(server, 'ssh_key_id', None):
        # Подключение по SSH-ключу из системы управления ключами
        logger.debug(f"Подключение к {server.name} по SSH-ключу (ID: {server.ssh_key_id})")
        
        # Импортируем ssh_key_storage здесь чтобы избежать циклических импортов
        from app.services.ssh_key_storage import ssh_key_storage
        
        try:
            # Получаем содержимое ключа
            passphrase = None
            if getattr(server, 'ssh_key_passphrase', None):
                passphrase = decrypt_password(server.ssh_key_passphrase)
            
            private_key_content, key_passphrase = ssh_key_storage.get_private_key_content(
                server.ssh_key_id, 
                passphrase
            )
            
            # Создаем временный файл для ключа
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as tmp_file:
                tmp_file.write(private_key_content)
                tmp_file_path = tmp_file.name
            
            try:
                # Пробуем загрузить ключ разных типов
                pkey = None
                for key_class in [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey]:
                    try:
                        pkey = key_class.from_private_key_file(tmp_file_path, password=key_passphrase)
                        logger.debug(f"Загружен {key_class.__name__} ключ для {server.name}")
                        break
                    except Exception as e:
                        continue
                
                if not pkey:
                    raise Exception("Не удалось загрузить приватный ключ")
                
                connect_kwargs['pkey'] = pkey
                
            finally:
                # Удаляем временный файл
                os.unlink(tmp_file_path)
                
        except Exception as e:
            logger.error(f"Ошибка загрузки SSH-ключа для {server.name}: {e}")
            raise
    else:
        # Подключение по паролю
        logger.debug(f"Подключение к {server.name} по паролю")
        connect_kwargs['password'] = server.ssh_password
    
    ssh.connect(**connect_kwargs)
    return ssh

def get_ssh_disk_usage(server: Server, data_dir: str) -> Tuple[Optional[int], Optional[int], str]:
    """Получение информации о диске через SSH"""
    cache_key = f"{server.host}:{server.ssh_port}"
    
    # Проверяем кэш
    cache_manager.clear_cache(cache_manager.ssh_cache, cache_manager.ssh_cache_lock, SSH_CACHE_TTL)
    
    cached_data = cache_manager.get_ssh_cache(cache_key)
    if cached_data:
        logger.debug(f"Использование SSH кэша для {server.name}")
        return cached_data["free_space"], cached_data["total_space"], "cached"
    
    # Если не в кэше, получаем данные
    if not is_host_reachable(server.host, server.ssh_port):
        logger.warning(f"SSH недоступен для {server.name}")
        return None, None, "unreachable"
    
    try:
        logger.debug(f"SSH подключение к {server.name}")
        ssh = get_ssh_client(server)
        
        # Извлекаем точку монтирования
        mount_point = data_dir.split('/DB')[0] if '/DB' in data_dir else data_dir
        cmd = f"df -B1 {mount_point}"
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=5)
        df_output = stdout.read().decode().strip().splitlines()
        error_output = stderr.read().decode().strip()
        
        if error_output:
            logger.warning(f"Ошибка df для {server.name}: {error_output}")
            ssh.close()
            return None, None, f"df error: {error_output}"
        
        if len(df_output) > 1:
            columns = df_output[1].split()
            if len(columns) >= 4:
                total_space = int(columns[1])
                free_space = int(columns[3])
                
                # Сохраняем в кэш
                cache_manager.set_ssh_cache(cache_key, {
                    "free_space": free_space,
                    "total_space": total_space
                })
                
                ssh.close()
                logger.debug(f"SSH данные получены для {server.name}")
                return free_space, total_space, "ok"
        
        ssh.close()
        return None, None, "invalid df output"
        
    except socket.timeout:
        logger.error(f"SSH таймаут для {server.name}")
        return None, None, "timeout"
    except paramiko.AuthenticationException:
        logger.error(f"SSH ошибка аутентификации для {server.name}")
        return None, None, "authentication failed"
    except Exception as e:
        logger.error(f"SSH ошибка для {server.name}: {e}")
        return None, None, str(e)
