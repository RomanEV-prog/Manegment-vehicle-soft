"""Initial schema — vse tabele

Revision ID: 001
Revises:
Create Date: 2026-03-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # organizations
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("type", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("full_name", sa.Text, nullable=False),
        sa.Column("role", sa.Text, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # vehicles
    op.create_table(
        "vehicles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("model", sa.Text, nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("vin", sa.Text, nullable=False, unique=True),
        sa.Column("seats", sa.Integer),
        sa.Column("project_name", sa.Text),
        sa.Column("status", sa.Text, default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # service_records
    op.create_table(
        "service_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("service_type", sa.Text, nullable=False),
        sa.Column("items", postgresql.ARRAY(sa.Text), nullable=False),
        sa.Column("technician", sa.Text, nullable=False),
        sa.Column("notes", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # sw_updates
    op.create_table(
        "sw_updates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("ecu_module", sa.Text, nullable=False),
        sa.Column("version_before", sa.Text, nullable=False),
        sa.Column("version_after", sa.Text, nullable=False),
        sa.Column("rxswin", sa.Text, nullable=False),
        sa.Column("method", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("notes", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # dtc_records
    op.create_table(
        "dtc_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("severity", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, default="active"),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("source", sa.Text, default="manual"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_dtc_records_active", "dtc_records", ["vehicle_id", "status"],
                    postgresql_where=sa.text("status = 'active'"))

    # homologations
    op.create_table(
        "homologations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("regulation", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("authority", sa.Text),
        sa.Column("country", sa.Text),
        sa.Column("valid_from", sa.Date),
        sa.Column("valid_until", sa.Date),
        sa.Column("notes", sa.Text),
        sa.Column("responsible_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("next_action_due", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("vehicle_id", "regulation"),
    )
    op.create_index("idx_homologations_vehicle", "homologations", ["vehicle_id"])

    # coc_certificates
    op.create_table(
        "coc_certificates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("coc_number", sa.Text, nullable=False),
        sa.Column("issued_at", sa.Date, nullable=False),
        sa.Column("valid_until", sa.Date),
        sa.Column("issuing_body", sa.Text),
        sa.Column("pdf_url", sa.Text),
        sa.Column("notes", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # vecto_calculations
    op.create_table(
        "vecto_calculations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("calculated_at", sa.Date, nullable=False),
        sa.Column("calculated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("co2_wltp", sa.Numeric(8, 2)),
        sa.Column("energy_wltp", sa.Numeric(8, 2)),
        sa.Column("range_km", sa.Integer),
        sa.Column("input_params", postgresql.JSONB),
        sa.Column("pdf_url", sa.Text),
        sa.Column("status", sa.Text, default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # photos
    op.create_table(
        "photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("linked_to_type", sa.Text, nullable=False),
        sa.Column("linked_to_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("thumbnail_url", sa.Text),
        sa.Column("photo_type", sa.Text, nullable=False),
        sa.Column("gps_lat", sa.Numeric(10, 8)),
        sa.Column("gps_lng", sa.Numeric(11, 8)),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("taken_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # vehicle_twins
    op.create_table(
        "vehicle_twins",
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), primary_key=True),
        sa.Column("ecu_config", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("hom_status", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("active_dtcs", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("last_service_at", sa.DateTime(timezone=True)),
        sa.Column("last_sw_update_at", sa.DateTime(timezone=True)),
        sa.Column("last_snapshot_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # twin_snapshots
    op.create_table(
        "twin_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("snapshot", postgresql.JSONB, nullable=False),
        sa.Column("trigger_type", sa.Text, nullable=False),
        sa.Column("trigger_id", postgresql.UUID(as_uuid=True)),
        sa.Column("trigger_label", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_twin_snapshots_vehicle", "twin_snapshots", ["vehicle_id", "created_at"])

    # alarm_configs
    op.create_table(
        "alarm_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("alarm_type", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("channels", postgresql.ARRAY(sa.Text), server_default="{email}"),
        sa.Column("recipients", postgresql.JSONB),
        sa.Column("recipient_roles", postgresql.ARRAY(sa.Text)),
        sa.Column("threshold", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # alarm_events
    op.create_table(
        "alarm_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id")),
        sa.Column("alarm_type", sa.Text, nullable=False),
        sa.Column("severity", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("is_read", sa.Boolean, default=False),
        sa.Column("delivered_via", postgresql.ARRAY(sa.Text)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("actor_type", sa.Text, nullable=False),
        sa.Column("actor_ip", sa.Text),
        sa.Column("actor_device", sa.Text),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("entity_type", sa.Text, nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("before", postgresql.JSONB),
        sa.Column("after", postgresql.JSONB),
        sa.Column("reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_audit_entity", "audit_logs", ["entity_type", "entity_id", "created_at"])
    op.create_index("idx_audit_actor", "audit_logs", ["actor_id", "created_at"])
    op.create_index("idx_audit_org", "audit_logs", ["org_id", "created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("alarm_events")
    op.drop_table("alarm_configs")
    op.drop_table("twin_snapshots")
    op.drop_table("vehicle_twins")
    op.drop_table("photos")
    op.drop_table("vecto_calculations")
    op.drop_table("coc_certificates")
    op.drop_table("homologations")
    op.drop_table("dtc_records")
    op.drop_table("sw_updates")
    op.drop_table("service_records")
    op.drop_table("vehicles")
    op.drop_table("users")
    op.drop_table("organizations")
