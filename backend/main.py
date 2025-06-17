# main.py (в корне backend)
#!/usr/bin/env python3
"""
Точка входа для PostgreSQL Activity Monitor API
"""
import uvicorn
from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )
