import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Homologation(Base):
    __tablename__ = "homologations"
    __table_args__ = (UniqueConstraint("vehicle_id", "regulation"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    regulation: Mapped[str] = mapped_column(String, nullable=False)  # 'UNECE R155', 'UNECE R156', 'UNECE R100', ...
    status: Mapped[str] = mapped_column(String, nullable=False)      # 'pending' | 'in_progress' | 'approved' | 'expired' | 'rejected'
    authority: Mapped[str | None] = mapped_column(String, nullable=True)    # 'TÜV', 'LCOE', 'GR_HOM'
    country: Mapped[str | None] = mapped_column(String, nullable=True)      # 'DE', 'GR', 'SI', 'JP'
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    next_action_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="homologations")
