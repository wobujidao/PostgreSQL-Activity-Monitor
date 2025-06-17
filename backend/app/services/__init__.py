# app/services/__init__.py
from .cache import cache_manager
from .ssh import get_ssh_disk_usage, is_host_reachable
from .server import load_servers, save_servers, connect_to_server

__all__ = [
    "cache_manager", 
    "get_ssh_disk_usage", 
    "is_host_reachable",
    "load_servers",
    "save_servers", 
    "connect_to_server"
]
from .user_manager import UserManager

user_manager = UserManager()

__all__.extend(["UserManager", "user_manager"])