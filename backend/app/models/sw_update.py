import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SWUpdate(Base):
    __tablename__ = "sw_updates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    ecu_module: Mapped[str] = mapped_column(String, nullable=False)  # 'Motor ECU', 'ABS/ESP', 'Battery BMS'
    version_before: Mapped[str] = mapped_column(String, nullable=False)  # '2.1.0'
    version_after: Mapped[str] = mapped_column(String, nullable=False)  # '2.2.1'
    rxswin: Mapped[str] = mapped_column(String, nullable=False)  # 'RXSWIN-EV-M1-221' — obvezno (R156 §7.2)
    method: Mapped[str] = mapped_column(String, nullable=False)  # 'OTA' | 'Workshop' | 'J2534'
    status: Mapped[str] = mapped_column(String, nullable=False)  # 'success' | 'failed' | 'pending'
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="sw_updates")
