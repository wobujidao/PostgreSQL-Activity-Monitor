# -*- coding: utf-8 -*-
# app/api/servers.py
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
import logging
from app.models import Server
from app.auth import get_current_user
from app.services import load_servers, save_servers, connect_to_server, cache_manager, SSHKeyManager
from app.services.ssh import is_host_reachable
from app.database import db_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/servers", tags=["servers"])

@router.get("", response_model=List[dict])
async def get_servers(current_user: dict = Depends(get_current_user)):
    """Get list of all servers with their status"""
    servers = load_servers()
    return [connect_to_server(server) for server in servers]

@router.post("", response_model=dict)
async def add_server(server: Server, current_user: dict = Depends(get_current_user)):
    """Add new server"""
    try:
        # Validate name and host
        if not server.name or server.name.lower() == 'test':
            raise HTTPException(status_code=400, detail="Invalid server name")
            
        if not server.host or server.host.lower() in ['test', 'localhost']:
            raise HTTPException(status_code=400, detail="Invalid host address")
        
        servers = load_servers()
        if any(s.name == server.name for s in servers):
            logger.warning("Attempt to add existing server: {}".format(server.name))
            raise HTTPException(status_code=400, detail="Server with this name already exists")
        
        # Quick availability check
        logger.info("Checking server availability {} ({}:{})".format(server.name, server.host, server.port))
        if not is_host_reachable(server.host, server.port):
            logger.warning("Server {} unreachable at {}:{}".format(server.name, server.host, server.port))
            raise HTTPException(
                status_code=400, 
                detail="Server {}:{} is unreachable. Check address and port.".format(server.host, server.port)
            )
        
        # Validate SSH key if provided
        if getattr(server, 'ssh_auth_type', 'password') == 'key' and getattr(server, 'ssh_key_id', None):
            # Импортируем ssh_key_storage здесь чтобы избежать циклических импортов
            from app.services.ssh_key_storage import ssh_key_storage
            
            # Проверяем существование ключа
            ssh_key = ssh_key_storage.get_key(server.ssh_key_id)
            if not ssh_key:
                raise HTTPException(status_code=400, detail="SSH key not found: {}".format(server.ssh_key_id))
        
        # Save server
        servers.append(server)
        save_servers(servers)
        logger.info("Added new server: {}".format(server.name))
        
        # Return full server information
        try:
            return connect_to_server(server)
        except Exception as e:
            # If connection failed, return basic info
            logger.warning("Could not get full server info for {}: {}".format(server.name, e))
            
            # Получаем информацию о ключе если используется
            ssh_key_info = None
            if getattr(server, "ssh_auth_type", "password") == "key" and getattr(server, "ssh_key_id", None):
                from app.services.ssh_key_storage import ssh_key_storage
                ssh_key = ssh_key_storage.get_key(server.ssh_key_id)
                if ssh_key:
                    ssh_key_info = {
                        "name": ssh_key.name,
                        "fingerprint": ssh_key.fingerprint
                    }
            
            return {
                "name": server.name,
                "host": server.host,
                "port": server.port,
                "user": server.user,
                "ssh_user": server.ssh_user,
                "ssh_port": server.ssh_port,
                "ssh_auth_type": getattr(server, "ssh_auth_type", "password"),
                "ssh_key_id": getattr(server, "ssh_key_id", None),
                "ssh_key_info": ssh_key_info,
                "has_password": bool(server.password),
                "has_ssh_password": bool(server.ssh_password),
                "status": "added (connection pending)",
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
        logger.error("Error adding server {}: {}".format(server.name, e))
        raise HTTPException(status_code=500, detail="Error adding server: {}".format(str(e)))

@router.put("/{server_name}", response_model=dict)
async def update_server(
    server_name: str, 
    updated_server: Server, 
    current_user: dict = Depends(get_current_user)
):
    """Update server configuration"""
    try:
        servers = load_servers()
        server_index = next((i for i, s in enumerate(servers) if s.name == server_name), None)
        if server_index is None:
            raise HTTPException(status_code=404, detail="Server not found")
        
        old_server = servers[server_index]
        
        # Validate SSH key if provided
        if getattr(updated_server, 'ssh_auth_type', 'password') == 'key' and getattr(updated_server, 'ssh_key_id', None):
            # Импортируем ssh_key_storage здесь чтобы избежать циклических импортов
            from app.services.ssh_key_storage import ssh_key_storage
            
            # Проверяем существование ключа
            ssh_key = ssh_key_storage.get_key(updated_server.ssh_key_id)
            if not ssh_key:
                raise HTTPException(status_code=400, detail="SSH key not found: {}".format(updated_server.ssh_key_id))
        
        # ВАЖНО: Проверяем, не пытаемся ли мы сохранить уже зашифрованный passphrase
        # Если passphrase начинается с "gAAAAA", значит он уже зашифрован
        if hasattr(updated_server, 'ssh_key_passphrase') and updated_server.ssh_key_passphrase:
            if updated_server.ssh_key_passphrase.startswith('gAAAAA'):
                logger.warning(f"Попытка сохранить уже зашифрованный passphrase для {server_name}")
                # Используем существующий passphrase из старого сервера
                if hasattr(old_server, 'ssh_key_passphrase'):
                    updated_server.ssh_key_passphrase = old_server.ssh_key_passphrase
                else:
                    updated_server.ssh_key_passphrase = None
        
        # Clear caches when server changes
        cache_key = "{}:{}".format(old_server.host, old_server.port)
        cache_manager.invalidate_server_cache(cache_key)
        
        # Close old pools if connection params changed
        if (old_server.host != updated_server.host or 
            old_server.port != updated_server.port or 
            old_server.user != updated_server.user):
            db_pool.close_pool(old_server)
            if old_server.stats_db:
                db_pool.close_pool(old_server, old_server.stats_db)
        
        servers[server_index] = updated_server
        save_servers(servers)
        logger.info("Updated server: {}".format(server_name))
        
        return connect_to_server(updated_server)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating server {}: {}".format(server_name, e))
        raise HTTPException(status_code=500, detail="Error updating server: {}".format(str(e)))

@router.delete("/{server_name}")
async def delete_server(server_name: str, current_user: dict = Depends(get_current_user)):
    """Delete server from configuration"""
    servers = load_servers()
    server_to_delete = next((s for s in servers if s.name == server_name), None)
    
    if not server_to_delete:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Clear caches
    cache_key = "{}:{}".format(server_to_delete.host, server_to_delete.port)
    cache_manager.invalidate_server_cache(cache_key)
    
    # Close pools for deleted server
    db_pool.close_pool(server_to_delete)
    if server_to_delete.stats_db:
        db_pool.close_pool(server_to_delete, server_to_delete.stats_db)
    
    updated_servers = [s for s in servers if s.name != server_name]
    save_servers(updated_servers)
    logger.info("Deleted server: {}".format(server_name))
    
    return {"message": "Server {} deleted".format(server_name)}

@router.post("/{server_name}/test-ssh")
async def test_ssh_connection(
    server_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Test SSH connection to server"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    try:
        if getattr(server, 'ssh_auth_type', 'password') == 'key' and getattr(server, 'ssh_key_id', None):
            # Импортируем ssh_key_storage здесь чтобы избежать циклических импортов
            from app.services.ssh_key_storage import ssh_key_storage
            
            # Получаем содержимое ключа
            passphrase = None
            if getattr(server, 'ssh_key_passphrase', None):
                passphrase = server.ssh_key_passphrase
            
            private_key_content, key_passphrase = ssh_key_storage.get_private_key_content(
                server.ssh_key_id, 
                passphrase
            )
            
            success, message = SSHKeyManager.test_ssh_connection(
                host=server.host,
                port=server.ssh_port,
                username=server.ssh_user,
                private_key_content=private_key_content,
                passphrase=key_passphrase
            )
        else:
            success, message = SSHKeyManager.test_ssh_connection(
                host=server.host,
                port=server.ssh_port,
                username=server.ssh_user,
                password=server.ssh_password
            )
        
        return {
            "success": success,
            "message": message,
            "auth_type": getattr(server, 'ssh_auth_type', 'password')
        }
        
    except Exception as e:
        logger.error("Error testing SSH for {}: {}".format(server_name, e))
        return {
            "success": False,
            "message": "Test failed: {}".format(str(e)),
            "auth_type": getattr(server, 'ssh_auth_type', 'password')
        }
