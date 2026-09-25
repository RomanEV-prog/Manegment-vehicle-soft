import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.sw_update import SWUpdate
from app.models.vehicle import Vehicle
from app.schemas.sw_update import SWUpdateCreate, SWUpdateResponse, SWUpdateUpdate
from app.utils.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[SWUpdateResponse])
async def list_sw_updates(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    ecu_module: str | None = Query(None),
    method: str | None = Query(None),
    status: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
):
    from datetime import date

    q = select(SWUpdate).where(SWUpdate.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(SWUpdate.vehicle_id == vehicle_id)
    if ecu_module:
        q = q.where(SWUpdate.ecu_module == ecu_module)
    if method:
        q = q.where(SWUpdate.method == method)
    if status:
        q = q.where(SWUpdate.status == status)
    if date_from:
        q = q.where(SWUpdate.date >= date.fromisoformat(date_from))
    if date_to:
        q = q.where(SWUpdate.date <= date.fromisoformat(date_to))
    result = await db.execute(q.order_by(SWUpdate.date.desc()).limit(limit).offset(offset))
    return result.scalars().all()


@router.post("", response_model=SWUpdateResponse, status_code=status.HTTP_201_CREATED)
async def create_sw_update(data: SWUpdateCreate, user: NonPartnerDep, db: DbSession):
    # Preveri da vozilo pripada tej organizaciji
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == data.vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    sw = SWUpdate(
        **data.model_dump(),
        organization_id=user["org_id"],
        created_by=user["user_id"],
    )
    db.add(sw)
    await db.flush()

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="sw_update",
        entity_id=sw.id,
        after={
            "vehicle_id": str(sw.vehicle_id),
            "ecu_module": sw.ecu_module,
            "version_before": sw.version_before,
            "version_after": sw.version_after,
            "rxswin": sw.rxswin,
            "method": sw.method,
            "status": sw.status,
            "date": str(sw.date),
        },
    )

    await db.commit()
    await db.refresh(sw)

    # Sproži twin update v ozadju (Celery)
    from app.workers.twin_worker import update_vehicle_twin

    update_vehicle_twin.delay(str(sw.vehicle_id), "sw_update", str(sw.id))

    return sw


@router.get("/{sw_id}", response_model=SWUpdateResponse)
async def get_sw_update(sw_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    result = await db.execute(select(SWUpdate).where(SWUpdate.id == sw_id, SWUpdate.organization_id == user["org_id"]))
    sw = result.scalar_one_or_none()
    if not sw:
        raise HTTPException(status_code=404, detail="SW posodobitev ne obstaja")
    return sw


@router.put("/{sw_id}", response_model=SWUpdateResponse)
async def update_sw_update(sw_id: uuid.UUID, data: SWUpdateUpdate, user: NonPartnerDep, db: DbSession):
    """
    Posodobi status SW posodobitve.
    Dovoljeni statusi: pending → in_progress → success | failed | rolled_back
    Vsaka sprememba statusa se zapiše v revizijsko sled (R156 §7.4).
    """
    result = await db.execute(select(SWUpdate).where(SWUpdate.id == sw_id, SWUpdate.organization_id == user["org_id"]))
    sw = result.scalar_one_or_none()
    if not sw:
        raise HTTPException(status_code=404, detail="SW posodobitev ne obstaja")

    VALID_STATUSES = {"pending", "in_progress", "success", "failed", "rolled_back"}
    if data.status and data.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Neveljaven status. Dovoljeno: {', '.join(VALID_STATUSES)}",
        )

    before = {
        "status": sw.status,
        "notes": sw.notes,
    }

    if data.status is not None:
        sw.status = data.status
    if data.notes is not None:
        sw.notes = data.notes

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="sw_update",
        entity_id=sw.id,
        before=before,
        after={
            "status": sw.status,
            "notes": sw.notes,
        },
    )

    await db.commit()
    await db.refresh(sw)

    # Twin posodobitev
    from app.workers.twin_worker import update_vehicle_twin

    update_vehicle_twin.delay(str(sw.vehicle_id), "sw_update", str(sw.id))

    return sw
