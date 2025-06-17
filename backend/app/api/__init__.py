# app/api/__init__.py
from .auth import router as auth_router
from .servers import router as servers_router
from .health import router as health_router
from .stats import router as stats_router

__all__ = ["auth_router", "servers_router", "health_router", "stats_router"]
from .users import router as users_router

__all__.append("users_router")