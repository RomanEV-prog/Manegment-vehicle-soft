import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    """
    Kdo je kaj spremenil, kdaj in kako — obvezno za R156 revizijo.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id", "created_at"),
        Index("idx_audit_actor", "actor_id", "created_at"),
        Index("idx_audit_org", "org_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    # Kdo
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # null = sistem
    actor_type: Mapped[str] = mapped_column(String, nullable=False)         # 'user' | 'system' | 'api_key'
    actor_ip: Mapped[str | None] = mapped_column(String, nullable=True)
    actor_device: Mapped[str | None] = mapped_column(String, nullable=True) # 'web' | 'mobile' | 'api'
    # Kaj
    action: Mapped[str] = mapped_column(String, nullable=False)
    # 'create' | 'update' | 'delete' | 'resolve' | 'approve' | 'upload' | 'snapshot' | 'export' | 'login' | 'logout'
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    # 'vehicle' | 'sw_update' | 'dtc_record' | 'homologation' | 'coc_certificate' | 'photo' | 'vehicle_twin'
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Stanje pred in po
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)       # null pri create
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)        # null pri delete
    # Kontekst
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
