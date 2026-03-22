import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AlarmEventResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    vehicle_id: uuid.UUID | None
    alarm_type: str
    severity: str
    title: str
    message: str
    is_read: bool
    delivered_via: list[str] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlarmConfigCreate(BaseModel):
    alarm_type: str
    is_active: bool = True
    channels: list[str] = ["email"]
    recipients: list[str] | None = None
    recipient_roles: list[str] | None = None
    threshold: dict[str, Any] | None = None


class AlarmConfigResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    alarm_type: str
    is_active: bool
    channels: list[str]
    recipients: list[str] | None
    recipient_roles: list[str] | None
    threshold: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
