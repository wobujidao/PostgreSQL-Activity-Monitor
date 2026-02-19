# app/models/audit.py
from pydantic import BaseModel
from datetime import datetime


class AuditEvent(BaseModel):
    timestamp: datetime
    event_type: str  # login_success | login_failed | refresh | logout
    username: str
    ip_address: str | None = None
    user_agent: str | None = None
    jti: str | None = None
    details: str | None = None
