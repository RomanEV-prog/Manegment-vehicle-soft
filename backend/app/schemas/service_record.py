import uuid
from datetime import date as Date, datetime
from typing import Optional

from pydantic import BaseModel


class ServiceRecordCreate(BaseModel):
    vehicle_id: uuid.UUID
    date: Date
    service_type: str               # 'maintenance' | 'brakes' | 'tyres' | 'electrical' | 'other'
    items: list[str]
    technician: str
    notes: Optional[str] = None


class ServiceRecordUpdate(BaseModel):
    date: Optional[Date] = None
    service_type: Optional[str] = None
    items: Optional[list[str]] = None
    technician: Optional[str] = None
    notes: Optional[str] = None


class ServiceRecordResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    date: Date
    service_type: str
    items: list[str]
    technician: str
    notes: Optional[str]
    created_by: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}
