import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None = None   # R156: vsak vnos mora biti pripisan osebi
    actor_type: str
    actor_ip: str | None
    actor_device: str | None
    action: str
    entity_type: str
    entity_id: uuid.UUID
    before: dict | None
    after: dict | None
    reason: str | None
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_custom(cls, obj: AuditLog, actor_name: str | None = None) -> "AuditLogResponse":
        return cls(
            id=obj.id,
            org_id=obj.org_id,
            actor_id=obj.actor_id,
            actor_name=actor_name,
            actor_type=obj.actor_type,
            actor_ip=obj.actor_ip,
            actor_device=obj.actor_device,
            action=obj.action,
            entity_type=obj.entity_type,
            entity_id=obj.entity_id,
            before=obj.before,
            after=obj.after,
            reason=obj.reason,
            created_at=obj.created_at.isoformat(),
        )


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    user: CurrentUserDep,
    db: DbSession,
    entity_type: str | None = Query(None),
    entity_id: uuid.UUID | None = Query(None),
    actor_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Revizijska sled — UNECE R156 §7.4 zahteva hranjenje vseh sprememb SUMS.
    Dostop: admin, qc_manager.
    """
    if user["role"] not in ("admin", "qc_manager"):
        raise HTTPException(status_code=403, detail="Premalo pravic")

    q = (
        select(AuditLog)
        .where(AuditLog.org_id == user["org_id"])
        .order_by(AuditLog.created_at.desc())
    )

    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    if actor_id:
        q = q.where(AuditLog.actor_id == actor_id)
    if action:
        q = q.where(AuditLog.action == action)
    if from_date:
        q = q.where(AuditLog.created_at >= from_date)
    if to_date:
        from datetime import timedelta
        q = q.where(AuditLog.created_at < (to_date + timedelta(days=1)))

    q = q.offset(offset).limit(limit)

    result = await db.execute(q)
    rows = result.scalars().all()
    actor_ids = {r.actor_id for r in rows if r.actor_id}
    names: dict = {}
    if actor_ids:
        names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(actor_ids)))).all())
    return [AuditLogResponse.from_orm_custom(r, names.get(r.actor_id)) for r in rows]


@router.get("/count")
async def count_audit_logs(
    user: CurrentUserDep,
    db: DbSession,
    entity_type: str | None = Query(None),
    entity_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
):
    """Skupno število audit log zapisov za paginacijo."""
    if user["role"] not in ("admin", "qc_manager"):
        raise HTTPException(status_code=403, detail="Premalo pravic")

    from sqlalchemy import func
    q = select(func.count()).where(AuditLog.org_id == user["org_id"])
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    if action:
        q = q.where(AuditLog.action == action)

    result = await db.execute(q)
    return {"count": result.scalar()}
