import uuid
from datetime import date, datetime

from pydantic import BaseModel


class HomologationCreate(BaseModel):
    vehicle_id: uuid.UUID
    regulation: str  # 'UNECE R155', 'UNECE R156', 'UNECE R100', 'UNECE R136', 'EC 2018/858', 'ISO 21434'
    status: str  # 'pending' | 'in_progress' | 'approved' | 'expired' | 'rejected'
    authority: str | None = None
    country: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    responsible_id: uuid.UUID | None = None
    next_action_due: date | None = None


class HomologationUpdate(BaseModel):
    status: str | None = None
    authority: str | None = None
    country: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    responsible_id: uuid.UUID | None = None
    next_action_due: date | None = None


class HomologationResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    regulation: str
    status: str
    authority: str | None
    country: str | None
    valid_from: date | None
    valid_until: date | None
    notes: str | None
    responsible_id: uuid.UUID | None
    next_action_due: date | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CoCCertificateCreate(BaseModel):
    vehicle_id: uuid.UUID
    coc_number: str
    issued_at: date
    valid_until: date | None = None
    issuing_body: str | None = None
    notes: str | None = None


class CoCCertificateResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    coc_number: str
    issued_at: date
    valid_until: date | None
    issuing_body: str | None
    pdf_url: str | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
