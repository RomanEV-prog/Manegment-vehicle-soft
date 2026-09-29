"""RXSWIN na vozilu (ECU + DID) in read-back ob izvedbi

Revision ID: 012
Revises: 011
Create Date: 2026-09-29

Odgovori J. Zduna (28. 9. 2026): RXSWIN je shranjen v pomnilniku BCU kot DID in
berljiv z UDS ReadDataByIdentifier prek OBD (R156 §7.2.1.2, §7.1.1.4). Ob izvedbi
posodobitve se zapiše, ali prebrani RXSWIN ustreza pričakovanemu.
"""
from typing import Sequence, Union

from alembic import op

from app.models.r156_locks import SU_CHILD_LOCK_SQL

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE rxswins ADD COLUMN IF NOT EXISTS stored_in_ecu_id UUID REFERENCES ecus(id)")
    op.execute("ALTER TABLE rxswins ADD COLUMN IF NOT EXISTS did VARCHAR")
    op.execute("ALTER TABLE software_update_targets ADD COLUMN IF NOT EXISTS readback_verified BOOLEAN")
    op.execute("ALTER TABLE software_update_targets ADD COLUMN IF NOT EXISTS readback_notes TEXT")
    # zaklep otroških zapisov dovoli zapis read-backa po izdaji
    for stmt in SU_CHILD_LOCK_SQL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("ALTER TABLE software_update_targets DROP COLUMN IF EXISTS readback_notes")
    op.execute("ALTER TABLE software_update_targets DROP COLUMN IF EXISTS readback_verified")
    op.execute("ALTER TABLE rxswins DROP COLUMN IF EXISTS did")
    op.execute("ALTER TABLE rxswins DROP COLUMN IF EXISTS stored_in_ecu_id")
