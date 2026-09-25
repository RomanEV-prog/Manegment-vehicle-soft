"""Uporabnik: čas zadnje menjave gesla

Revision ID: 010
Revises: 009
Create Date: 2026-09-25

Refresh žetoni, izdani pred menjavo ali ponastavitvijo gesla, se zavrnejo.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at")
