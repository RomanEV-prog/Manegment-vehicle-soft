"""Konfiguracije vozila: razlog, nespremenljivost, ena EOL na vozilo

Revision ID: 008
Revises: 007
Create Date: 2026-09-25

Konfiguracija ob koncu linije (initial_eol) in zadnje znane konfiguracije
(last_known) so posnetki po VIN (R156 §7.1.2.2). Zapis je nespremenljiv —
vsaka sprememba (posodobitev SW, zamenjava ECU) doda nov zapis.
"""
from typing import Sequence, Union

from alembic import op

from app.models.r156_locks import CONFIG_LOCK_SQL

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE vehicle_configurations ADD COLUMN IF NOT EXISTS reason TEXT")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_vehicle_configurations_vehicle_created "
        "ON vehicle_configurations (vehicle_id, created_at)"
    )
    for stmt in CONFIG_LOCK_SQL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_vehicle_configuration_lock ON vehicle_configurations")
    op.execute("DROP FUNCTION IF EXISTS vehicle_configuration_lock()")
    op.execute("DROP INDEX IF EXISTS uq_vehicle_config_eol")
    op.execute("DROP INDEX IF EXISTS ix_vehicle_configurations_vehicle_created")
    op.drop_column("vehicle_configurations", "reason")
