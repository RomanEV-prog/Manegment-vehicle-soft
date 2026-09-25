import re
import uuid
from datetime import date as Date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator


# R156 formata RXSWIN ne predpisuje — določi ga proizvajalec (npr. R48SWIN001,
# RXSWIN-EV-M1-221). Zahtevamo le velike črke, številke in ločila - _ .
RXSWIN_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{2,63}$")


class SWUpdateCreate(BaseModel):
    vehicle_id: uuid.UUID
    date: Date
    ecu_module: str
    version_before: str
    version_after: str
    rxswin: str                     # obvezno — R156 §7.2
    method: str                     # 'OTA' | 'Workshop' | 'J2534'
    status: str = "pending"         # 'success' | 'failed' | 'pending'
    notes: Optional[str] = None

    @field_validator("rxswin")
    @classmethod
    def validate_rxswin(cls, v: str) -> str:
        if not RXSWIN_PATTERN.match(v):
            raise ValueError(
                "RXSWIN sme vsebovati le velike črke, številke in - _ . (3–64 znakov), npr. R48SWIN001"
            )
        return v


class SWUpdateUpdate(BaseModel):
    status: Optional[str] = None       # 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back'
    notes: Optional[str] = None


class SWUpdateResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    date: Date
    ecu_module: str
    version_before: str
    version_after: str
    rxswin: str
    method: str
    status: str
    notes: Optional[str]
    created_by: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}
