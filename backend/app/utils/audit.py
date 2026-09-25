import functools
import uuid
from typing import Any, Callable

from sqlalchemy.ext.asyncio import AsyncSession


async def write_audit_log(
    db: AsyncSession,
    org_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    actor_type: str,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    actor_device: str | None = None,
    actor_ip: str | None = None,
) -> None:
    from app.models.audit_log import AuditLog

    log = AuditLog(
        org_id=org_id,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_ip=actor_ip,
        actor_device=actor_device,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        reason=reason,
    )
    db.add(log)
    # Ne commitamo tukaj — caller je odgovoren za commit


def csv_safe(v) -> str:
    """Celica, ki se začne z = + - @ ali tab/CR, bi se v Excelu izvedla kot formula."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s
