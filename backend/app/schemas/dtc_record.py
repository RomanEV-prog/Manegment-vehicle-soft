import uuid
from datetime import datetime

from pydantic import BaseModel


class DTCRecordCreate(BaseModel):
    vehicle_id: uuid.UUID
    code: str  # 'P0401', 'U0100'
    description: str
    severity: str  # 'low' | 'medium' | 'high'
    detected_at: datetime
    source: str = "manual"  # 'manual' | 'obd'


class DTCRecordResolve(BaseModel):
    reason: str
    resolved_by: uuid.UUID | None = None


class DTCRecordUpdate(BaseModel):
    status: str | None = None  # 'active' | 'in_review' | 'resolved'
    assigned_to: uuid.UUID | None = None
    reason: str | None = None


class DTCRecordResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    code: str
    description: str
    severity: str
    status: str
    detected_at: datetime
    resolved_at: datetime | None
    resolved_by: uuid.UUID | None
    assigned_to: uuid.UUID | None
    source: str
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
