"""OBD modul — obd_sessions tabela + obd_live_data v vehicle_twins

Revision ID: 002
Revises: 001
Create Date: 2026-03-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # obd_sessions
    op.create_table(
        "obd_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("adapter_type", sa.Text, nullable=False, server_default="ELM327"),
        sa.Column("adapter_id", sa.Text),
        sa.Column("protocol", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="completed"),
        sa.Column("live_data", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("raw_pids", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("dtcs_raw", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("dtc_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("dtcs_imported", sa.Integer, nullable=False, server_default="0"),
        sa.Column("dtcs_skipped", sa.Integer, nullable=False, server_default="0"),
        sa.Column("vin_from_obd", sa.Text),
        sa.Column("ecu_info", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("notes", sa.Text),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_obd_sessions_vehicle", "obd_sessions", ["vehicle_id", "scanned_at"])
    op.create_index("idx_obd_sessions_org", "obd_sessions", ["organization_id", "scanned_at"])

    # Dodaj obd_live_data in last_obd_scan_at v vehicle_twins
    op.add_column(
        "vehicle_twins",
        sa.Column("obd_live_data", postgresql.JSONB, nullable=False, server_default="{}"),
    )
    op.add_column(
        "vehicle_twins",
        sa.Column("last_obd_scan_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicle_twins", "last_obd_scan_at")
    op.drop_column("vehicle_twins", "obd_live_data")
    op.drop_index("idx_obd_sessions_org", table_name="obd_sessions")
    op.drop_index("idx_obd_sessions_vehicle", table_name="obd_sessions")
    op.drop_table("obd_sessions")
