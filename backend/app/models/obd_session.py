import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OBDSession(Base):
    """
    OBD-II diagnostic session — en klic iz adapterja (ELM327, J2534, ...).
    Vsebuje live PID podatke + seznam odkritih DTC kod.
    Adapter → POST /obd/{vehicle_id}/scan → ta zapis.
    """

    __tablename__ = "obd_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )

    adapter_type: Mapped[str] = mapped_column(String, nullable=False, default="ELM327")
    # 'ELM327' | 'J2534' | 'K-Line' | 'manual'

    adapter_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # serijska številka / Bluetooth MAC / napravni ID

    protocol: Mapped[str | None] = mapped_column(String, nullable=True)
    # 'ISO 15765-4 CAN' | 'SAE J1850 PWM' | 'SAE J1850 VPW' | 'ISO 9141-2' | ...

    status: Mapped[str] = mapped_column(String, nullable=False, default="completed")
    # 'completed' | 'error' | 'partial'

    live_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Parsirani PID podatki: rpm, speed_kmh, coolant_temp_c, ...

    raw_pids: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Surovi hex odgovori: {"0C": "0FA0", "0D": "2D"}

    dtcs_raw: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Surove DTC kode iz OBD (pred importom v dtc_records)
    # [{"code": "P0420", "freeze_frame": {...}}, ...]

    dtc_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dtcs_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dtcs_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    vin_from_obd: Mapped[str | None] = mapped_column(String, nullable=True)
    # VIN prebran iz vozila (Mode 09 PID 02) — za validacijo

    ecu_info: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Informacije o ECU modulih (Mode 09): {"motor_ecu": "SW 2.2.1 HW 1.0"}

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="obd_sessions")
