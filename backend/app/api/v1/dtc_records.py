import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.dtc_record import DTCRecord
from app.models.vehicle import Vehicle
from app.schemas.dtc_record import DTCRecordCreate, DTCRecordResponse, DTCRecordUpdate
from app.utils.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[DTCRecordResponse])
async def list_dtc_records(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    severity: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    q = select(DTCRecord).where(DTCRecord.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(DTCRecord.vehicle_id == vehicle_id)
    if status:
        q = q.where(DTCRecord.status == status)
    if severity:
        q = q.where(DTCRecord.severity == severity)
    if source:
        q = q.where(DTCRecord.source == source)
    result = await db.execute(q.order_by(DTCRecord.detected_at.desc()).limit(limit).offset(offset))
    return result.scalars().all()


@router.post("", response_model=DTCRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_dtc_record(data: DTCRecordCreate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == data.vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    dtc = DTCRecord(
        **data.model_dump(),
        organization_id=user["org_id"],
        created_by=user["user_id"],
    )
    db.add(dtc)
    await db.flush()

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="dtc_record",
        entity_id=dtc.id,
        after={
            "vehicle_id": str(dtc.vehicle_id),
            "code": dtc.code,
            "severity": dtc.severity,
            "status": dtc.status,
            "source": dtc.source,
            "description": dtc.description,
        },
    )

    await db.commit()
    await db.refresh(dtc)

    # Event bus → alarm engine + twin update
    from app.workers.twin_worker import update_vehicle_twin
    from app.workers.alarm_worker import check_dtc_alarm
    update_vehicle_twin.delay(str(dtc.vehicle_id), "dtc", str(dtc.id))
    if dtc.severity == "high":
        check_dtc_alarm.delay(str(dtc.id), str(user["org_id"]))

    return dtc


@router.put("/{dtc_id}", response_model=DTCRecordResponse)
async def update_dtc_record(dtc_id: uuid.UUID, data: DTCRecordUpdate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(DTCRecord).where(DTCRecord.id == dtc_id, DTCRecord.organization_id == user["org_id"])
    )
    dtc = result.scalar_one_or_none()
    if not dtc:
        raise HTTPException(status_code=404, detail="DTC ne obstaja")

    before = {
        "status": dtc.status,
        "assigned_to": str(dtc.assigned_to) if dtc.assigned_to else None,
        "resolved_at": dtc.resolved_at.isoformat() if dtc.resolved_at else None,
    }

    action = "update"
    if data.status == "resolved":
        dtc.resolved_at = datetime.now(timezone.utc)
        dtc.resolved_by = user["user_id"]
        action = "resolve"
    if data.status:
        dtc.status = data.status
    if data.assigned_to:
        dtc.assigned_to = data.assigned_to

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action=action,
        entity_type="dtc_record",
        entity_id=dtc.id,
        before=before,
        after={
            "status": dtc.status,
            "assigned_to": str(dtc.assigned_to) if dtc.assigned_to else None,
            "resolved_at": dtc.resolved_at.isoformat() if dtc.resolved_at else None,
        },
    )

    await db.commit()
    await db.refresh(dtc)

    # Twin update
    from app.workers.twin_worker import update_vehicle_twin
    update_vehicle_twin.delay(str(dtc.vehicle_id), "dtc", str(dtc.id))

    return dtc


class BatchResolveRequest(BaseModel):
    ids: List[uuid.UUID]


@router.post("/batch-resolve", response_model=dict)
async def batch_resolve_dtc_records(data: BatchResolveRequest, user: CurrentUserDep, db: DbSession):
    """Batch resolve DTC zapisov — označi vse izbrane kot resolved."""
    if not data.ids:
        raise HTTPException(status_code=400, detail="Ni izbranih DTC zapisov")
    if len(data.ids) > 100:
        raise HTTPException(status_code=400, detail="Največ 100 zapisov naenkrat")

    resolved_count = 0
    vehicle_ids: set[str] = set()
    now = datetime.now(timezone.utc)

    for dtc_id in data.ids:
        result = await db.execute(
            select(DTCRecord).where(
                DTCRecord.id == dtc_id,
                DTCRecord.organization_id == user["org_id"],
            )
        )
        dtc = result.scalar_one_or_none()
        if not dtc or dtc.status == "resolved":
            continue

        before = {"status": dtc.status}
        dtc.status = "resolved"
        dtc.resolved_at = now
        dtc.resolved_by = user["user_id"]

        await write_audit_log(
            db=db,
            org_id=user["org_id"],
            actor_id=user["user_id"],
            actor_type="user",
            actor_device="web",
            action="resolve",
            entity_type="dtc_record",
            entity_id=dtc.id,
            before=before,
            after={"status": "resolved", "resolved_at": now.isoformat()},
        )

        vehicle_ids.add(str(dtc.vehicle_id))
        resolved_count += 1

    await db.commit()

    # Posodobi twin za vsako vozilo
    from app.workers.twin_worker import update_vehicle_twin
    for vid in vehicle_ids:
        update_vehicle_twin.delay(vid, "dtc_batch_resolve", "batch")

    return {"resolved": resolved_count}


@router.delete("/{dtc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dtc_record(dtc_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(DTCRecord).where(DTCRecord.id == dtc_id, DTCRecord.organization_id == user["org_id"])
    )
    dtc = result.scalar_one_or_none()
    if not dtc:
        raise HTTPException(status_code=404, detail="DTC ne obstaja")

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="delete",
        entity_type="dtc_record",
        entity_id=dtc.id,
        before={
            "vehicle_id": str(dtc.vehicle_id),
            "code": dtc.code,
            "severity": dtc.severity,
            "status": dtc.status,
        },
    )

    await db.delete(dtc)
    await db.commit()
