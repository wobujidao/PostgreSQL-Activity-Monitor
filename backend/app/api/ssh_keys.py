# app/api/ssh_keys.py
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from typing import List, Optional
import logging
import io
from datetime import datetime
from app.models.ssh_key import SSHKeyCreate, SSHKeyImport, SSHKeyResponse
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.services.ssh_key_storage import ssh_key_storage
from app.services import load_servers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ssh-keys", tags=["ssh-keys"])

def require_admin_or_operator(current_user: User = Depends(get_current_user)) -> User:
    """Проверка прав администратора или оператора"""
    if current_user.role not in ["admin", "operator"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав. Требуется роль администратора или оператора"
        )
    return current_user

@router.get("", response_model=List[SSHKeyResponse])
async def list_ssh_keys(current_user: User = Depends(get_current_user)):
    """Получить список всех SSH-ключей"""
    try:
        keys = ssh_key_storage.list_keys()
        return [SSHKeyResponse(**key.dict()) for key in keys]
    except Exception as e:
        logger.error(f"Ошибка получения списка ключей: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{key_id}", response_model=SSHKeyResponse)
async def get_ssh_key(key_id: str, current_user: User = Depends(get_current_user)):
    """Получить информацию о конкретном SSH-ключе"""
    key = ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")
    return SSHKeyResponse(**key.dict())

@router.post("/generate", response_model=SSHKeyResponse)
async def generate_ssh_key(
    key_data: SSHKeyCreate,
    current_user: User = Depends(require_admin_or_operator)
):
    """Сгенерировать новый SSH-ключ"""
    try:
        # Проверяем уникальность имени
        existing_keys = ssh_key_storage.list_keys()
        if any(k.name == key_data.name for k in existing_keys):
            raise HTTPException(
                status_code=400,
                detail=f"Ключ с именем '{key_data.name}' уже существует"
            )
        
        # Создаем ключ
        key = ssh_key_storage.create_key(key_data, current_user.login)
        return SSHKeyResponse(**key.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка генерации ключа: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import", response_model=SSHKeyResponse)
async def import_ssh_key(
    key_data: SSHKeyImport,
    current_user: User = Depends(require_admin_or_operator)
):
    """Импортировать существующий SSH-ключ"""
    try:
        # Проверяем уникальность имени
        existing_keys = ssh_key_storage.list_keys()
        if any(k.name == key_data.name for k in existing_keys):
            raise HTTPException(
                status_code=400,
                detail=f"Ключ с именем '{key_data.name}' уже существует"
            )
        
        # Импортируем ключ
        key = ssh_key_storage.import_key(key_data, current_user.login)
        return SSHKeyResponse(**key.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка импорта ключа: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import-file", response_model=SSHKeyResponse)
async def import_ssh_key_file(
    file: UploadFile = File(...),
    name: str = None,
    passphrase: Optional[str] = None,
    description: Optional[str] = None,
    current_user: User = Depends(require_admin_or_operator)
):
    """Импортировать SSH-ключ из файла"""
    try:
        # Читаем содержимое файла
        content = await file.read()
        private_key = content.decode('utf-8')
        
        # Используем имя файла если имя не указано
        if not name:
            name = file.filename.replace('.pem', '').replace('.key', '')
        
        # Создаем объект для импорта
        key_import = SSHKeyImport(
            name=name,
            private_key=private_key,
            passphrase=passphrase,
            description=description
        )
        
        # Импортируем ключ
        key = ssh_key_storage.import_key(key_import, current_user.login)
        return SSHKeyResponse(**key.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка импорта ключа из файла: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{key_id}")
async def delete_ssh_key(
    key_id: str,
    current_user: User = Depends(require_admin_or_operator)
):
    """Удалить SSH-ключ"""
    try:
        # Проверяем, не используется ли ключ
        servers = load_servers()
        servers_using_key = [
            s.name for s in servers 
            if getattr(s, 'ssh_key_id', None) == key_id
        ]
        
        if servers_using_key:
            raise HTTPException(
                status_code=400,
                detail=f"Ключ используется на серверах: {', '.join(servers_using_key)}"
            )
        
        # Удаляем ключ
        if not ssh_key_storage.delete_key(key_id):
            raise HTTPException(status_code=404, detail="SSH-ключ не найден")
        
        return {"message": "SSH-ключ успешно удален"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка удаления ключа: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{key_id}/servers")
async def get_key_servers(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """Получить список серверов, использующих данный ключ"""
    key = ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")
    
    servers = load_servers()
    servers_using_key = [
        {"name": s.name, "host": s.host}
        for s in servers 
        if getattr(s, 'ssh_key_id', None) == key_id
    ]
    
    return {
        "key_name": key.name,
        "servers_count": len(servers_using_key),
        "servers": servers_using_key
    }

@router.get("/{key_id}/download-public")
async def download_public_key(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """Скачать публичный ключ"""
    key = ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")
    
    return {
        "filename": f"{key.name}_id_{key.key_type}.pub",
        "content": key.public_key,
        "content_type": "text/plain"
    }

@router.get("/{key_id}/installation-script")
async def get_installation_script(
    key_id: str,
    server_host: str,
    server_user: str,
    current_user: User = Depends(get_current_user)
):
    """Получить скрипт для установки ключа на сервер"""
    key = ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")
    
    script = f"""#!/bin/bash
# Скрипт установки SSH-ключа '{key.name}'
# Сгенерировано: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

SERVER_HOST="{server_host}"
SERVER_USER="{server_user}"
PUBLIC_KEY="{key.public_key}"

echo "🔐 Установка SSH-ключа для PostgreSQL Activity Monitor"
echo "Ключ: {key.name}"
echo "Fingerprint: {key.fingerprint}"
echo "Сервер: $SERVER_USER@$SERVER_HOST"
echo ""

# Проверка подключения
echo "1. Проверка подключения к серверу..."
ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_HOST "echo 'Подключение успешно'" || {{
    echo "❌ Ошибка подключения. Проверьте доступность сервера."
    exit 1
}}

# Установка ключа
echo "2. Установка публичного ключа..."
ssh $SERVER_USER@$SERVER_HOST "
    mkdir -p ~/.ssh && chmod 700 ~/.ssh
    echo '$PUBLIC_KEY' >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo '✅ Ключ установлен успешно'
"

# Тест подключения по ключу
echo "3. Тест подключения по ключу..."
ssh -o PasswordAuthentication=no $SERVER_USER@$SERVER_HOST "echo '✅ Подключение по ключу работает'" || {{
    echo "❌ Ошибка подключения по ключу"
    exit 1
}}

echo ""
echo "🎉 Установка завершена успешно!"
echo "Теперь вы можете использовать этот ключ в настройках сервера."
"""
    
    return {
        "filename": f"install_{key.name}_{server_host}.sh",
        "content": script,
        "content_type": "text/plain"
    }

@router.post("/{key_id}/update-servers-count")
async def update_servers_count(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """Обновить количество серверов, использующих ключ"""
    servers = load_servers()
    count = len([s for s in servers if getattr(s, 'ssh_key_id', None) == key_id])
    
    ssh_key_storage.update_servers_count(key_id, count)
    
    return {"key_id": key_id, "servers_count": count}
