"""Software Update dokumenti: tip vozila na vozilu, obvestilo uporabniku, zaklep

Revision ID: 007
Revises: 006
Create Date: 2026-09-25

- vehicles.vehicle_type_id: ciljna vozila posodobitve morajo biti pravega tipa
- software_updates.user_notified_by: kdo je obvestil uporabnika (§7.1.1.11)
- triggerji: izdan Software Update dokument, prizadeti RXSWIN-i in ciljna vozila
  so samo za branje; po izdaji se sme zapisati le izvedba na vozilu
"""
from typing import Sequence, Union

from alembic import op

from app.models.r156_locks import SU_CHILD_LOCK_SQL, SU_LOCK_SQL

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_type_id UUID REFERENCES vehicle_types(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vehicles_vehicle_type_id ON vehicles (vehicle_type_id)")
    op.execute("ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS user_notified_by UUID REFERENCES users(id)")
    for stmt in SU_LOCK_SQL + SU_CHILD_LOCK_SQL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_su_target_lock ON software_update_targets")
    op.execute("DROP TRIGGER IF EXISTS trg_su_rxswin_lock ON software_update_rxswins")
    op.execute("DROP TRIGGER IF EXISTS trg_software_update_lock ON software_updates")
    op.execute("DROP FUNCTION IF EXISTS software_update_child_lock()")
    op.execute("DROP FUNCTION IF EXISTS software_update_lock()")
    op.drop_column("software_updates", "user_notified_by")
    op.drop_index("ix_vehicles_vehicle_type_id", table_name="vehicles")
    op.drop_column("vehicles", "vehicle_type_id")
