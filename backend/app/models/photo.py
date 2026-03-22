import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from decimal import Decimal

from app.database import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    # Polimorfna povezava
    linked_to_type: Mapped[str] = mapped_column(String, nullable=False)     # 'service' | 'dtc' | 'homologation' | 'coc' | 'shipment'
    linked_to_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Metapodatki
    filename: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)                # MinIO signed URL
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    photo_type: Mapped[str] = mapped_column(String, nullable=False)         # 'before' | 'after' | 'damage' | 'document' | 'shipment_state'
    gps_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)
    gps_lng: Mapped[Decimal | None] = mapped_column(Numeric(11, 8), nullable=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    taken_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle")
