# app/models/server.py
from pydantic import BaseModel
from typing import Optional

class Server(BaseModel):
    name: str
    host: str
    stats_db: Optional[str] = None
    user: str
    password: str
    port: int
    ssh_user: str
    ssh_password: str
    ssh_port: int = 22
