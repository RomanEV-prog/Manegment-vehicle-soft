"""
Modeli za UNECE R156 SUMS — tip vozila, ECU register, RXSWIN baseline register,
Software Update dokument in zamrznjene konfiguracije vozila.

Poimenovanje polj sledi Helix modelu iz diagrama 'R156 SUMS Overview.drawio',
da je preslikava za TÜV revizijo očitna. Sklici na odstavke R156 so v komentarjih.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VehicleType(Base):
    """Tip vozila — R156 dokumentacija je vezana na tip, ne na posamezno vozilo."""

    __tablename__ = "vehicle_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)               # 'e-Shuttle MK II-400'
    model_code: Mapped[str | None] = mapped_column(String, nullable=True)   # interna oznaka tipa
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_vehicle_type_org_name"),)

    ecus: Mapped[list["ECU"]] = relationship("ECU", back_populates="vehicle_type")
    rxswins: Mapped[list["RXSWIN"]] = relationship("RXSWIN", back_populates="vehicle_type")


class ECU(Base):
    """Katalog ECU po tipu vozila (R156 §7.1.1.2 — enolična identifikacija komponent)."""

    __tablename__ = "ecus"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    vehicle_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicle_types.id"), nullable=False
    )
    ecu_name: Mapped[str] = mapped_column(String, nullable=False)                    # 'Body Control Unit'
    system_name: Mapped[str | None] = mapped_column(String, nullable=True)           # 'Exterior Lighting'
    supplier: Mapped[str | None] = mapped_column(String, nullable=True)              # 'Continental'
    eversum_part_number: Mapped[str] = mapped_column(String, nullable=False)         # 'EV-00002-37716'
    un_ece_reg_number: Mapped[str | None] = mapped_column(String, nullable=True)     # 'UN-ECE Reg 48'
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("vehicle_type_id", "ecu_name", name="uq_ecu_type_name"),
    )

    vehicle_type: Mapped["VehicleType"] = relationship("VehicleType", back_populates="ecus")
    instances: Mapped[list["VehicleECU"]] = relationship("VehicleECU", back_populates="ecu")


class VehicleECU(Base):
    """Instanca ECU, vgrajena v konkretno vozilo (serijska številka, HW verzija, batch)."""

    __tablename__ = "vehicle_ecus"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    ecu_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecus.id"), nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String, nullable=True)      # 'N6200012501301'
    hardware_version: Mapped[str | None] = mapped_column(String, nullable=True)   # 'v.1.3'
    batch_number: Mapped[str | None] = mapped_column(String, nullable=True)       # '7009'
    installed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("vehicle_id", "ecu_id", name="uq_vehicle_ecu"),
    )

    ecu: Mapped["ECU"] = relationship("ECU", back_populates="instances")


class RXSWIN(Base):
    """RXSWIN kot entiteta (R156 §7.1.1.3, §7.2.1.2.1) — ne le tekstovna oznaka."""

    __tablename__ = "rxswins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    vehicle_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicle_types.id"), nullable=False
    )
    rxswin: Mapped[str] = mapped_column(String, nullable=False)                       # 'R48SWIN001'
    description: Mapped[str | None] = mapped_column(Text, nullable=True)             # funkcionalnost sistema
    regulations_affected: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")    # 'active' | 'retired'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("organization_id", "rxswin", name="uq_rxswin_org_code"),)

    vehicle_type: Mapped["VehicleType"] = relationship("VehicleType", back_populates="rxswins")
    baselines: Mapped[list["RXSWINBaseline"]] = relationship(
        "RXSWINBaseline", back_populates="rxswin_ref", order_by="RXSWINBaseline.baseline_number"
    )


class RXSWINBaseline(Base):
    """
    Revizijsko sledljiv register (R156 §7.1.2.3): stanje programske opreme za en RXSWIN.

    Ob izdaji (status='released') postane zapis samo za branje. Sprememba pomeni nov
    baseline z višjo številko; prejšnji dobi status 'superseded' in ostane viden.
    """

    __tablename__ = "rxswin_baselines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    rxswin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rxswins.id"), nullable=False)
    baseline_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")  # draft|released|superseded
    integrity_method: Mapped[str] = mapped_column(String, nullable=False, default="SHA-256")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("rxswin_id", "baseline_number", name="uq_baseline_rxswin_number"),
    )

    rxswin_ref: Mapped["RXSWIN"] = relationship("RXSWIN", back_populates="baselines")
    items: Mapped[list["RXSWINBaselineItem"]] = relationship(
        "RXSWINBaselineItem", back_populates="baseline", cascade="all, delete-orphan"
    )


class RXSWINBaselineItem(Base):
    """Ena programska datoteka v baseline-u, z integritetnimi podatki (R156 §7.1.2.3)."""

    __tablename__ = "rxswin_baseline_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baseline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rxswin_baselines.id", ondelete="CASCADE"), nullable=False
    )
    ecu_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ecus.id"), nullable=False)
    sw_version: Mapped[str] = mapped_column(String, nullable=False)                     # 'ES03v02_vcu1_1_2_115'
    sw_file_name: Mapped[str | None] = mapped_column(String, nullable=True)             # '...hex'
    sw_file_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    sw_config_version: Mapped[str | None] = mapped_column(String, nullable=True)
    sw_config_file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    sw_config_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    egnyte_folder_url: Mapped[str | None] = mapped_column(String, nullable=True)
    compatible_hardware: Mapped[str | None] = mapped_column(String, nullable=True)      # '927889/TTC-500'
    change_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("baseline_id", "ecu_id", name="uq_baseline_item_ecu"),)

    baseline: Mapped["RXSWINBaseline"] = relationship("RXSWINBaseline", back_populates="items")
    ecu: Mapped["ECU"] = relationship("ECU")


class SoftwareUpdateDocument(Base):
    """
    Software Update dokument (R156 §7.1.2.5) — vezan na tip vozila.

    Vsako polje pokriva konkretno zahtevo iz TÜV SÜD samoocene; sklici v komentarjih.
    Ob izdaji se zaklene enako kot RXSWIN baseline.
    """

    __tablename__ = "software_updates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    vehicle_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicle_types.id"), nullable=False
    )
    document_id: Mapped[str] = mapped_column(String, nullable=False)                 # 'SU-2026-001'
    title: Mapped[str] = mapped_column(String, nullable=False)

    # §7.1.2.5 (a) namen posodobitve
    description_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    # §7.1.1.5 / §7.1.2.5 (b) odvisnosti in prizadeti sistemi
    dependencies_identified: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_schemes_baseline: Mapped[str | None] = mapped_column(String, nullable=True)

    # §7.1.3.3 / §7.1.2.5 (i) verifikacija in validacija
    vv_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending|pass|fail
    vv_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    vv_signed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    vv_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # §7.1.1.8, §7.1.1.9, §7.1.1.10, §7.1.2.5 (c)(d)(e)(f) tipska odobritev
    type_approval_update_necessary: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    type_approval_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    unece_affected_requirements: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    type_approval_granted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    type_approval_number: Mapped[str | None] = mapped_column(String, nullable=True)
    type_approval_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # §7.1.1.11 obveščanje uporabnika
    user_notification_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    user_notification_method: Mapped[str | None] = mapped_column(String, nullable=True)
    user_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # §7.1.2.5 (g)(h) izvedba in varnost
    execution_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    safe_state_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_hardware_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    safety_security_confirmation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # povezave navzven
    erp_work_order: Mapped[str | None] = mapped_column(String, nullable=True)
    erp_work_order_url: Mapped[str | None] = mapped_column(String, nullable=True)
    egnyte_folder_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # zaklep / revizija
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")  # draft|released|superseded
    baseline_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_updates.id"), nullable=True
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "document_id", "baseline_number", name="uq_su_doc_rev"),
    )

    affected_rxswins: Mapped[list["SoftwareUpdateRXSWIN"]] = relationship(
        "SoftwareUpdateRXSWIN", back_populates="document", cascade="all, delete-orphan"
    )
    targets: Mapped[list["SoftwareUpdateTarget"]] = relationship(
        "SoftwareUpdateTarget", back_populates="document", cascade="all, delete-orphan"
    )


class SoftwareUpdateRXSWIN(Base):
    """Prizadeti RXSWIN-i s stanjem pred in po posodobitvi (R156 §7.1.2.3)."""

    __tablename__ = "software_update_rxswins"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    software_update_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_updates.id", ondelete="CASCADE"), nullable=False
    )
    rxswin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rxswins.id"), nullable=False)
    baseline_before_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rxswin_baselines.id"), nullable=True
    )
    baseline_after_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rxswin_baselines.id"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("software_update_id", "rxswin_id", name="uq_su_rxswin"),
    )

    document: Mapped["SoftwareUpdateDocument"] = relationship(
        "SoftwareUpdateDocument", back_populates="affected_rxswins"
    )
    rxswin_ref: Mapped["RXSWIN"] = relationship("RXSWIN")


class SoftwareUpdateTarget(Base):
    """Ciljna vozila posodobitve in potrditev združljivosti (R156 §7.1.1.6, §7.1.1.7, §7.1.2.4)."""

    __tablename__ = "software_update_targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    software_update_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_updates.id", ondelete="CASCADE"), nullable=False
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    compatibility_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    compatibility_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    result: Mapped[str | None] = mapped_column(String, nullable=True)  # success|failed|rolled_back
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("software_update_id", "vehicle_id", name="uq_su_target_vehicle"),
    )

    document: Mapped["SoftwareUpdateDocument"] = relationship(
        "SoftwareUpdateDocument", back_populates="targets"
    )


class VehicleConfiguration(Base):
    """
    Zamrznjena konfiguracija vozila (R156 §7.1.2.2): 'initial_eol' ob koncu proizvodne
    linije in 'last_known' po vsaki posodobitvi. Zapis je nespremenljiv — nova
    konfiguracija pomeni nov zapis, ne urejanje starega.
    """

    __tablename__ = "vehicle_configurations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False)
    config_type: Mapped[str] = mapped_column(String, nullable=False)  # 'initial_eol' | 'last_known'
    config_id: Mapped[str | None] = mapped_column(String, nullable=True)  # berljiv ID, npr. 'EOL-2026-001'
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    system_schemes_baseline: Mapped[str | None] = mapped_column(String, nullable=True)
    vv_status: Mapped[str | None] = mapped_column(String, nullable=True)
    erp_work_order: Mapped[str | None] = mapped_column(String, nullable=True)
    software_update_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software_updates.id"), nullable=True
    )
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
