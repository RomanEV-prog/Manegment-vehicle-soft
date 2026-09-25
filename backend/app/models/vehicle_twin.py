import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VehicleTwin(Base):
    """
    Živi objekt — posodablja se ob vsakem posegu.
    Primer ecu_config:
    {
        "motor_ecu":     {"version": "2.2.1", "rxswin": "RXSWIN-EV-M1-221", "updated_at": "2026-03-01"},
        "abs_esp":       {"version": "1.3.2", "rxswin": "RXSWIN-EV-A1-132", "updated_at": "2025-11-12"},
        "battery_bms":   {"version": "3.1.0", "rxswin": "RXSWIN-EV-B1-310", "updated_at": "2026-02-17"}
    }
    """

    __tablename__ = "vehicle_twins"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), primary_key=True)
    ecu_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    hom_status: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    active_dtcs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    obd_live_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_service_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sw_update_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_obd_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_snapshot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="twin")
