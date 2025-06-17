# app/models/user.py
from pydantic import BaseModel
from typing import Optional

class User(BaseModel):
    login: str
    password: str  # Хэшированный
    role: str = "admin"  # Пока только admin
