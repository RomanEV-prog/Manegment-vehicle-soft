import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class VehicleCreate(BaseModel):
    name: str
    model: str
    year: int
    vin: str
    seats: int | None = None
    project_name: str | None = None
    status: str = "active"


class VehicleUpdate(BaseModel):
    name: str | None = None
    model: str | None = None
    year: int | None = None
    seats: int | None = None
    project_name: str | None = None
    status: str | None = None


class VehicleResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    model: str
    year: int
    vin: str
    seats: int | None
    project_name: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VehicleTwinResponse(BaseModel):
    vehicle_id: uuid.UUID
    ecu_config: dict[str, Any]
    hom_status: dict[str, Any]
    active_dtcs: list[Any]
    last_service_at: datetime | None
    last_sw_update_at: datetime | None
    last_snapshot_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}
