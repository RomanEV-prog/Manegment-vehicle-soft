import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)           # "Alfa", "Harlander #1"
    model: Mapped[str] = mapped_column(String, nullable=False)          # "e-Shuttle MK II-400"
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    vin: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    seats: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_name: Mapped[str | None] = mapped_column(String, nullable=True)  # "Imagry Japan", "Navya France"
    status: Mapped[str] = mapped_column(String, default="active")       # 'active' | 'in_service' | 'shipped' | 'decommissioned'
    # R156: tip vozila, na katerega so vezani RXSWIN-i in Software Update dokumenti
    vehicle_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicle_types.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="vehicles")
    service_records: Mapped[list["ServiceRecord"]] = relationship("ServiceRecord", back_populates="vehicle")
    sw_updates: Mapped[list["SWUpdate"]] = relationship("SWUpdate", back_populates="vehicle")
    dtc_records: Mapped[list["DTCRecord"]] = relationship("DTCRecord", back_populates="vehicle")
    homologations: Mapped[list["Homologation"]] = relationship("Homologation", back_populates="vehicle")
    coc_certificates: Mapped[list["CoCCertificate"]] = relationship("CoCCertificate", back_populates="vehicle")
    twin: Mapped["VehicleTwin | None"] = relationship("VehicleTwin", back_populates="vehicle", uselist=False)
    snapshots: Mapped[list["TwinSnapshot"]] = relationship("TwinSnapshot", back_populates="vehicle")
    obd_sessions: Mapped[list["OBDSession"]] = relationship("OBDSession", back_populates="vehicle")
