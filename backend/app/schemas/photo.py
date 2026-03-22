import uuid
from datetime import datetime
from pydantic import BaseModel


class PhotoResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    vehicle_id: uuid.UUID
    linked_to_type: str | None
    linked_to_id: uuid.UUID | None
    filename: str
    url: str  # signed URL
    photo_type: str
    gps_lat: float | None
    gps_lng: float | None
    taken_at: datetime | None
    taken_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
