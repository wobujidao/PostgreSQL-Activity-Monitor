# app/api/servers.py
from fastapi import APIRouter, HTTPException, Depends
from typing import List
import logging
from app.models import Server
from app.auth import get_current_user
from app.services import load_servers, save_servers, connect_to_server, cache_manager
from app.services.ssh import is_host_reachable
from app.database import db_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/servers", tags=["servers"])

@router.get("", response_model=List[dict])
async def get_servers(current_user: dict = Depends(get_current_user)):
    """Получить список всех серверов с их статусом"""
    servers = load_servers()
    return [connect_to_server(server) for server in servers]

@router.post("", response_model=dict)
async def add_server(server: Server, current_user: dict = Depends(get_current_user)):
    """Добавить новый сервер"""
    try:
        # Валидация имени и хоста
        if not server.name or server.name.lower() == 'test':
            raise HTTPException(status_code=400, detail="Недопустимое имя сервера")
            
        if not server.host or server.host.lower() in ['test', 'localhost']:
            raise HTTPException(status_code=400, detail="Недопустимый адрес хоста")
        
        servers = load_servers()
        if any(s.name == server.name for s in servers):
            logger.warning(f"Попытка добавить существующий сервер: {server.name}")
            raise HTTPException(status_code=400, detail="Server with this name already exists")
        
        # Быстрая проверка доступности
        logger.info(f"Проверка доступности сервера {server.name} ({server.host}:{server.port})")
        if not is_host_reachable(server.host, server.port):
            logger.warning(f"Сервер {server.name} недоступен по адресу {server.host}:{server.port}")
            raise HTTPException(
                status_code=400, 
                detail=f"Сервер {server.host}:{server.port} недоступен. Проверьте адрес и порт."
            )
        
        # Сохраняем сервер
        servers.append(server)
        save_servers(servers)
        logger.info(f"Добавлен новый сервер: {server.name}")
        
        # Возвращаем базовую информацию без полного подключения
        return {
            "name": server.name,
            "host": server.host,
            "port": server.port,
            "user": server.user,
            "ssh_user": server.ssh_user,
            "ssh_port": server.ssh_port,
            "has_password": bool(server.password),
            "has_ssh_password": bool(server.ssh_password),
            "status": "added",
            "version": None,
            "free_space": None,
            "total_space": None,
            "connections": None,
            "uptime_hours": None,
            "stats_db": server.stats_db,
            "data_dir": None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при добавлении сервера {server.name}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при добавлении сервера: {str(e)}")

@router.put("/{server_name}", response_model=dict)
async def update_server(
    server_name: str, 
    updated_server: Server, 
    current_user: dict = Depends(get_current_user)
):
    """Обновить конфигурацию сервера"""
    try:
        servers = load_servers()
        server_index = next((i for i, s in enumerate(servers) if s.name == server_name), None)
        if server_index is None:
            raise HTTPException(status_code=404, detail="Server not found")
        
        old_server = servers[server_index]
        
        # Очищаем кэши при изменении сервера
        cache_key = f"{old_server.host}:{old_server.port}"
        cache_manager.invalidate_server_cache(cache_key)
        
        # Закрываем старые пулы если изменились параметры подключения
        if (old_server.host != updated_server.host or 
            old_server.port != updated_server.port or 
            old_server.user != updated_server.user):
            db_pool.close_pool(old_server)
            if old_server.stats_db:
                db_pool.close_pool(old_server, old_server.stats_db)
        
        servers[server_index] = updated_server
        save_servers(servers)
        logger.info(f"Обновлён сервер: {server_name}")
        
        return connect_to_server(updated_server)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при обновлении сервера {server_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении сервера: {str(e)}")

@router.delete("/{server_name}")
async def delete_server(server_name: str, current_user: dict = Depends(get_current_user)):
    """Удалить сервер из конфигурации"""
    servers = load_servers()
    server_to_delete = next((s for s in servers if s.name == server_name), None)
    
    if not server_to_delete:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Очищаем кэши
    cache_key = f"{server_to_delete.host}:{server_to_delete.port}"
    cache_manager.invalidate_server_cache(cache_key)
    
    # Закрываем пулы для удаляемого сервера
    db_pool.close_pool(server_to_delete)
    if server_to_delete.stats_db:
        db_pool.close_pool(server_to_delete, server_to_delete.stats_db)
    
    updated_servers = [s for s in servers if s.name != server_name]
    save_servers(updated_servers)
    logger.info(f"Удалён сервер: {server_name}")
    
    return {"message": f"Server {server_name} deleted"}
