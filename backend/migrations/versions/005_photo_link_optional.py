"""Fotografija je lahko vezana samo na vozilo

Revision ID: 005
Revises: 004
Create Date: 2026-09-24

API in odjemalca (zavihek Fotografije, mobilna aplikacija) nalagata fotografije
brez povezave na zapis, stolpca pa sta bila NOT NULL — nalaganje je vrnilo 500.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("photos", "linked_to_type", nullable=True)
    op.alter_column("photos", "linked_to_id", nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM photos WHERE linked_to_type IS NULL OR linked_to_id IS NULL")
    op.alter_column("photos", "linked_to_id", nullable=False)
    op.alter_column("photos", "linked_to_type", nullable=False)
