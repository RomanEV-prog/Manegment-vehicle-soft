import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TwinSnapshot(Base):
    """
    Nespremenljiva historia snapshotov — audit trail za R156.
    """
    __tablename__ = "twin_snapshots"
    __table_args__ = (
        Index("idx_twin_snapshots_vehicle", "vehicle_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)           # celotno stanje ob trenutku spremembe
    trigger_type: Mapped[str] = mapped_column(String, nullable=False)       # 'service' | 'sw_update' | 'dtc' | 'homologation' | 'shipment' | 'manual'
    trigger_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    trigger_label: Mapped[str | None] = mapped_column(String, nullable=True) # "OTA Motor ECU 2.1.0 → 2.2.1"
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="snapshots")
