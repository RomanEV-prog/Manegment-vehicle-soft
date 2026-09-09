"""R156 SUMS: tip vozila, ECU register, RXSWIN baseline register, Software Update dokument

Revision ID: 004
Revises: 003
Create Date: 2026-09-09

Doda strukture, ki jih zahteva UNECE R156 in ki jih obstoječi model ni imel:
enolična identifikacija ECU (§7.1.1.2), RXSWIN kot revizijsko sledljiv register
s SHA-256 integritetnimi podatki (§7.1.2.3), Software Update dokument z vsemi
polji iz §7.1.2.5, ciljna vozila (§7.1.2.4) in zamrznjene konfiguracije (§7.1.2.2).

Obstoječa tabela sw_updates ostane kot zapis izvedbe na posameznem vozilu in
dobi neobvezno povezavo na dokument.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vehicle_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("model_code", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_vehicle_type_org_name"),
    )

    op.create_table(
        "ecus",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("vehicle_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicle_types.id"), nullable=False),
        sa.Column("ecu_name", sa.String(), nullable=False),
        sa.Column("system_name", sa.String(), nullable=True),
        sa.Column("supplier", sa.String(), nullable=True),
        sa.Column("eversum_part_number", sa.String(), nullable=False),
        sa.Column("un_ece_reg_number", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("vehicle_type_id", "ecu_name", name="uq_ecu_type_name"),
    )
    op.create_index("idx_ecus_org", "ecus", ["organization_id"])

    op.create_table(
        "vehicle_ecus",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("ecu_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ecus.id"), nullable=False),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column("hardware_version", sa.String(), nullable=True),
        sa.Column("batch_number", sa.String(), nullable=True),
        sa.Column("installed_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("vehicle_id", "ecu_id", name="uq_vehicle_ecu"),
    )
    op.create_index("idx_vehicle_ecus_vehicle", "vehicle_ecus", ["vehicle_id"])

    op.create_table(
        "rxswins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("vehicle_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicle_types.id"), nullable=False),
        sa.Column("rxswin", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("regulations_affected", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "rxswin", name="uq_rxswin_org_code"),
    )

    op.create_table(
        "rxswin_baselines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("rxswin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rxswins.id"), nullable=False),
        sa.Column("baseline_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("integrity_method", sa.String(), nullable=False, server_default="SHA-256"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("rxswin_id", "baseline_number", name="uq_baseline_rxswin_number"),
    )
    op.create_index("idx_rxswin_baselines_rxswin", "rxswin_baselines", ["rxswin_id", "baseline_number"])

    op.create_table(
        "rxswin_baseline_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "baseline_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rxswin_baselines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ecu_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ecus.id"), nullable=False),
        sa.Column("sw_version", sa.String(), nullable=False),
        sa.Column("sw_file_name", sa.String(), nullable=True),
        sa.Column("sw_file_sha256", sa.String(), nullable=True),
        sa.Column("sw_config_version", sa.String(), nullable=True),
        sa.Column("sw_config_file_name", sa.String(), nullable=True),
        sa.Column("sw_config_sha256", sa.String(), nullable=True),
        sa.Column("egnyte_folder_url", sa.String(), nullable=True),
        sa.Column("compatible_hardware", sa.String(), nullable=True),
        sa.Column("change_log", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("baseline_id", "ecu_id", name="uq_baseline_item_ecu"),
    )

    op.create_table(
        "software_updates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("vehicle_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicle_types.id"), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description_purpose", sa.Text(), nullable=False),
        sa.Column("dependencies_identified", sa.Text(), nullable=True),
        sa.Column("system_schemes_baseline", sa.String(), nullable=True),
        sa.Column("vv_status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("vv_method", sa.Text(), nullable=True),
        sa.Column("vv_signed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("vv_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("type_approval_update_necessary", sa.Boolean(), nullable=True),
        sa.Column("type_approval_justification", sa.Text(), nullable=True),
        sa.Column("unece_affected_requirements", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("type_approval_granted", sa.Boolean(), nullable=True),
        sa.Column("type_approval_number", sa.String(), nullable=True),
        sa.Column("type_approval_date", sa.Date(), nullable=True),
        sa.Column("user_notification_required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("user_notification_method", sa.String(), nullable=True),
        sa.Column("user_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_conditions", sa.Text(), nullable=True),
        sa.Column("safe_state_conditions", sa.Text(), nullable=True),
        sa.Column("new_hardware_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("safety_security_confirmation", sa.Text(), nullable=True),
        sa.Column("erp_work_order", sa.String(), nullable=True),
        sa.Column("erp_work_order_url", sa.String(), nullable=True),
        sa.Column("egnyte_folder_url", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("baseline_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("supersedes_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("software_updates.id"), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "document_id", "baseline_number", name="uq_su_doc_rev"),
    )
    op.create_index("idx_software_updates_type", "software_updates", ["vehicle_type_id"])

    op.create_table(
        "software_update_rxswins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "software_update_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("software_updates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rxswin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rxswins.id"), nullable=False),
        sa.Column("baseline_before_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rxswin_baselines.id"), nullable=True),
        sa.Column("baseline_after_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rxswin_baselines.id"), nullable=True),
        sa.UniqueConstraint("software_update_id", "rxswin_id", name="uq_su_rxswin"),
    )

    op.create_table(
        "software_update_targets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "software_update_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("software_updates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("compatibility_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("compatibility_notes", sa.Text(), nullable=True),
        sa.Column("confirmed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("result", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("software_update_id", "vehicle_id", name="uq_su_target_vehicle"),
    )
    op.create_index("idx_su_targets_vehicle", "software_update_targets", ["vehicle_id"])

    op.create_table(
        "vehicle_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vehicles.id"), nullable=False),
        sa.Column("config_type", sa.String(), nullable=False),
        sa.Column("config_id", sa.String(), nullable=True),
        sa.Column("snapshot", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("system_schemes_baseline", sa.String(), nullable=True),
        sa.Column("vv_status", sa.String(), nullable=True),
        sa.Column("erp_work_order", sa.String(), nullable=True),
        sa.Column("software_update_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("software_updates.id"), nullable=True),
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_vehicle_configs_vehicle", "vehicle_configurations", ["vehicle_id", "config_type", "created_at"]
    )

    # Obstoječi zapis izvedbe dobi povezavo na dokument (neobvezno — stari zapisi ostanejo)
    op.add_column(
        "sw_updates",
        sa.Column("software_update_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("software_updates.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sw_updates", "software_update_id")
    op.drop_index("idx_vehicle_configs_vehicle", table_name="vehicle_configurations")
    op.drop_table("vehicle_configurations")
    op.drop_index("idx_su_targets_vehicle", table_name="software_update_targets")
    op.drop_table("software_update_targets")
    op.drop_table("software_update_rxswins")
    op.drop_index("idx_software_updates_type", table_name="software_updates")
    op.drop_table("software_updates")
    op.drop_table("rxswin_baseline_items")
    op.drop_index("idx_rxswin_baselines_rxswin", table_name="rxswin_baselines")
    op.drop_table("rxswin_baselines")
    op.drop_table("rxswins")
    op.drop_index("idx_vehicle_ecus_vehicle", table_name="vehicle_ecus")
    op.drop_table("vehicle_ecus")
    op.drop_index("idx_ecus_org", table_name="ecus")
    op.drop_table("ecus")
    op.drop_table("vehicle_types")
