# app/api/ssh_keys.py
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
import logging
import io
from datetime import datetime
from app.models.ssh_key import SSHKeyCreate, SSHKeyImport, SSHKeyResponse
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.services import ssh_key_storage
from app.services.server import load_servers

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

@router.get("", response_model=list[SSHKeyResponse])
async def list_ssh_keys(current_user: User = Depends(get_current_user)):
    """Получить список всех SSH-ключей"""
    # Viewer не может видеть SSH-ключи
    if current_user.role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для просмотра SSH-ключей"
        )

    try:
        keys = await ssh_key_storage.list_keys()

        # Для оператора скрываем публичные ключи
        if current_user.role == "operator":
            result = []
            for key in keys:
                key_dict = key.model_dump()
                key_dict['public_key'] = "[Скрыто для оператора]"
                result.append(SSHKeyResponse(**key_dict))
            return result
        return [SSHKeyResponse(**key.model_dump()) for key in keys]
    except Exception as e:
        logger.error(f"Ошибка получения списка ключей: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{key_id}", response_model=SSHKeyResponse)
async def get_ssh_key(key_id: str, current_user: User = Depends(get_current_user)):
    """Получить информацию о конкретном SSH-ключе"""
    # Viewer не может видеть SSH-ключи
    if current_user.role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для просмотра SSH-ключей"
        )

    key = await ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")

    # Для оператора скрываем публичный ключ
    if current_user.role == "operator":
        key_dict = key.model_dump()
        key_dict['public_key'] = "[Скрыто для оператора]"
        return SSHKeyResponse(**key_dict)

    return SSHKeyResponse(**key.model_dump())

@router.post("/generate", response_model=SSHKeyResponse)
async def generate_ssh_key(
    key_data: SSHKeyCreate,
    current_user: User = Depends(require_admin_or_operator)
):
    """Сгенерировать новый SSH-ключ"""
    try:
        # Проверяем уникальность имени
        existing_keys = await ssh_key_storage.list_keys()
        if any(k.name == key_data.name for k in existing_keys):
            raise HTTPException(
                status_code=400,
                detail=f"Ключ с именем '{key_data.name}' уже существует"
            )

        # Создаем ключ
        key = await ssh_key_storage.create_key(key_data, current_user.login)

        # Проверяем, не существует ли уже ключ с таким fingerprint
        # (теоретически невозможно для сгенерированных ключей, но проверим)
        if any(k.fingerprint == key.fingerprint and k.id != key.id for k in existing_keys):
            # Удаляем созданный ключ
            await ssh_key_storage.delete_key(key.id)
            raise HTTPException(
                status_code=400,
                detail=f"Ключ с таким fingerprint уже существует в системе"
            )

        return SSHKeyResponse(**key.model_dump())
    except HTTPException:
        raise
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
        existing_keys = await ssh_key_storage.list_keys()
        if any(k.name == key_data.name for k in existing_keys):
            raise HTTPException(
                status_code=400,
                detail=f"Ключ с именем '{key_data.name}' уже существует"
            )

        # Сначала валидируем ключ и получаем его fingerprint
        from app.services.ssh_key_manager import SSHKeyManager
        is_valid, error_msg, fingerprint = SSHKeyManager.validate_private_key(
            key_data.private_key,
            key_data.passphrase
        )

        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Невалидный приватный ключ: {error_msg}")

        # Проверяем, не существует ли уже ключ с таким fingerprint
        existing_key = next((k for k in existing_keys if k.fingerprint == fingerprint), None)
        if existing_key:
            raise HTTPException(
                status_code=400,
                detail=f"Этот ключ уже существует в системе под именем '{existing_key.name}'. "
                       f"Fingerprint: {fingerprint}"
            )

        # Импортируем ключ
        key = await ssh_key_storage.import_key(key_data, current_user.login)
        return SSHKeyResponse(**key.model_dump())
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка импорта ключа: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import-file", response_model=SSHKeyResponse)
async def import_ssh_key_file(
    file: UploadFile = File(...),
    name: str = None,
    passphrase: str | None = None,
    description: str | None = None,
    current_user: User = Depends(require_admin_or_operator)
):
    """Импортировать SSH-ключ из файла"""
    try:
        # Читаем содержимое файла
        content = await file.read()
        private_key = content.decode('utf-8')

        # Используем имя файла если имя не указано (с защитой от path traversal)
        if not name:
            import os
            safe_filename = os.path.basename(file.filename or "imported_key")
            name = safe_filename.replace('.pem', '').replace('.key', '')

        # Проверяем уникальность имени
        existing_keys = await ssh_key_storage.list_keys()
        if any(k.name == name for k in existing_keys):
            raise HTTPException(
                status_code=400,
                detail=f"Ключ с именем '{name}' уже существует"
            )

        # Валидируем ключ и получаем fingerprint
        from app.services.ssh_key_manager import SSHKeyManager
        is_valid, error_msg, fingerprint = SSHKeyManager.validate_private_key(
            private_key,
            passphrase
        )

        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Невалидный приватный ключ: {error_msg}")

        # Проверяем, не существует ли уже ключ с таким fingerprint
        existing_key = next((k for k in existing_keys if k.fingerprint == fingerprint), None)
        if existing_key:
            raise HTTPException(
                status_code=400,
                detail=f"Этот ключ уже существует в системе под именем '{existing_key.name}'. "
                       f"Fingerprint: {fingerprint}"
            )

        # Создаем объект для импорта
        key_import = SSHKeyImport(
            name=name,
            private_key=private_key,
            passphrase=passphrase,
            description=description
        )

        # Импортируем ключ
        key = await ssh_key_storage.import_key(key_import, current_user.login)
        return SSHKeyResponse(**key.model_dump())
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка импорта ключа из файла: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{key_id}", response_model=SSHKeyResponse)
async def update_ssh_key(
    key_id: str,
    update_data: dict,
    current_user: User = Depends(require_admin_or_operator)
):
    """Обновить информацию о SSH-ключе"""
    try:
        # Получаем текущий ключ
        key = await ssh_key_storage.get_key(key_id)
        if not key:
            raise HTTPException(status_code=404, detail="SSH-ключ не найден")

        # Обновляем только разрешенные поля
        allowed_fields = ['name', 'description']
        updates = {}

        for field in allowed_fields:
            if field in update_data:
                updates[field] = update_data[field]

        # Проверяем уникальность имени если оно меняется
        if 'name' in updates and updates['name'] != key.name:
            existing_keys = await ssh_key_storage.list_keys()
            if any(k.name == updates['name'] for k in existing_keys):
                raise HTTPException(
                    status_code=400,
                    detail=f"Ключ с именем '{updates['name']}' уже существует"
                )

        # Обновляем ключ
        updated_key = await ssh_key_storage.update_key(key_id, updates)
        if not updated_key:
            raise HTTPException(status_code=500, detail="Ошибка обновления ключа")

        return SSHKeyResponse(**updated_key.model_dump())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка обновления ключа {key_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{key_id}")
async def delete_ssh_key(
    key_id: str,
    current_user: User = Depends(require_admin_or_operator)
):
    """Удалить SSH-ключ"""
    try:
        # Проверяем, не используется ли ключ
        servers = await load_servers()
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
        if not await ssh_key_storage.delete_key(key_id):
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
    key = await ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")

    servers = await load_servers()
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
    # Только администратор может скачивать публичные ключи
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только администраторы могут скачивать публичные ключи"
        )

    key = await ssh_key_storage.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="SSH-ключ не найден")

    return {
        "filename": f"{key.name}_id_{key.key_type}.pub",
        "content": key.public_key,
        "content_type": "text/plain"
    }

@router.post("/{key_id}/update-servers-count")
async def update_servers_count(
    key_id: str,
    current_user: User = Depends(get_current_user)
):
    """Обновить количество серверов, использующих ключ"""
    servers = await load_servers()
    count = len([s for s in servers if getattr(s, 'ssh_key_id', None) == key_id])

    return {"key_id": key_id, "servers_count": count}
