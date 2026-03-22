import uuid
from datetime import date, datetime
from pydantic import BaseModel


class CoCCreate(BaseModel):
    vehicle_id: uuid.UUID
    coc_number: str
    issued_at: date
    valid_until: date | None = None
    issuing_body: str | None = None
    pdf_url: str | None = None


class CoCResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    vehicle_id: uuid.UUID
    coc_number: str
    issued_at: date
    valid_until: date | None
    issuing_body: str | None
    pdf_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
