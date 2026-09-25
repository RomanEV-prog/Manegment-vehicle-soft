import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, Date, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from decimal import Decimal

from app.database import Base


class VectoCalculation(Base):
    __tablename__ = "vecto_calculations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    calculated_at: Mapped[date] = mapped_column(Date, nullable=False)
    calculated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    co2_wltp: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)  # g/km
    energy_wltp: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)  # Wh/km
    range_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_params: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # masa, drag, baterija...
    pdf_url: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="draft")  # 'draft' | 'submitted' | 'approved'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle")
