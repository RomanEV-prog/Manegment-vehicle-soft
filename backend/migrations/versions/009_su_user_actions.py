"""Software Update: dejanja uporabnika pred namestitvijo (§7.1.2.5 (g))

Revision ID: 009
Revises: 008
Create Date: 2026-09-25

Samoocena TÜV SÜD, §7.1.2.5 kriterij 12: dokumentacija mora navesti dejanja,
ki jih mora pred namestitvijo izvesti uporabnik vozila ali usposobljena oseba.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # trigger zaklepa primerja celotno vrstico (to_jsonb) — nov stolpec ga ne zmoti
    op.execute("ALTER TABLE software_updates ADD COLUMN IF NOT EXISTS user_actions_required TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE software_updates DROP COLUMN IF EXISTS user_actions_required")
