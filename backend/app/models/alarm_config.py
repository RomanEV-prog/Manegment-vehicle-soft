import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AlarmConfig(Base):
    __tablename__ = "alarm_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    alarm_type: Mapped[str] = mapped_column(String, nullable=False)
    # 'dtc_high_severity' | 'sw_version_outdated' | 'hom_action_overdue' | 'service_overdue'
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    channels: Mapped[list[str]] = mapped_column(ARRAY(String), default=["email"])  # ['email', 'push', 'sms']
    recipients: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # user_ids, null = vsi z vlogo
    recipient_roles: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)  # ['qc_manager', 'admin']
    threshold: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # {"days": 7} ali {"versions_behind": 2}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
