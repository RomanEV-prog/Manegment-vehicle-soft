"""Zaklep izdanih RXSWIN baseline-ov v bazi

Revision ID: 006
Revises: 005
Create Date: 2026-09-25

Izdan (released) baseline in njegove postavke so samo za branje; dovoljen je le
prehod released → superseded. Triggerji veljajo tudi za neposreden SQL.
SQL je v app/models/r156_locks.py (isti se uporabi za testno bazo).
"""
from typing import Sequence, Union

from alembic import op

from app.models.r156_locks import BASELINE_LOCK_SQL, ITEM_LOCK_SQL

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for stmt in BASELINE_LOCK_SQL + ITEM_LOCK_SQL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_rxswin_baseline_item_lock ON rxswin_baseline_items")
    op.execute("DROP TRIGGER IF EXISTS trg_rxswin_baseline_lock ON rxswin_baselines")
    op.execute("DROP FUNCTION IF EXISTS rxswin_baseline_item_lock()")
    op.execute("DROP FUNCTION IF EXISTS rxswin_baseline_lock()")
