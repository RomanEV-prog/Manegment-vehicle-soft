"""Utrditev zaklepov: revizijska sled samo za dodajanje, prestavitev otroških zapisov

Revision ID: 011
Revises: 010
Create Date: 2026-09-25

- audit_logs: UPDATE in DELETE zavrnjena (tudi z neposrednim SQL)
- software_update_rxswins/targets: pri UPDATE se preveri tudi prejšnji dokument,
  prestavitev zapisa iz izdanega dokumenta ni mogoča
"""
from typing import Sequence, Union

from alembic import op

from app.models.r156_locks import AUDIT_LOCK_SQL, SU_CHILD_LOCK_SQL

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for stmt in AUDIT_LOCK_SQL + SU_CHILD_LOCK_SQL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS audit_log_append_only()")
