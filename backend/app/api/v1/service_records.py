import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.service_record import ServiceRecord
from app.models.vehicle import Vehicle
from app.schemas.service_record import ServiceRecordCreate, ServiceRecordResponse, ServiceRecordUpdate
from app.utils.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[ServiceRecordResponse])
async def list_service_records(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
):
    q = select(ServiceRecord).where(ServiceRecord.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(ServiceRecord.vehicle_id == vehicle_id)
    result = await db.execute(q.order_by(ServiceRecord.date.desc()))
    return result.scalars().all()


@router.post("", response_model=ServiceRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_service_record(data: ServiceRecordCreate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == data.vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    record = ServiceRecord(**data.model_dump(), organization_id=user["org_id"], created_by=user["user_id"])
    db.add(record)
    await db.flush()

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="service_record",
        entity_id=record.id,
        after={
            "vehicle_id": str(record.vehicle_id),
            "service_type": record.service_type,
            "technician": record.technician,
            "date": str(record.date),
            "items": record.items,
        },
    )

    await db.commit()
    await db.refresh(record)

    from app.workers.twin_worker import update_vehicle_twin

    update_vehicle_twin.delay(str(record.vehicle_id), "service", str(record.id))

    return record


@router.get("/{record_id}", response_model=ServiceRecordResponse)
async def get_service_record(record_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(ServiceRecord).where(ServiceRecord.id == record_id, ServiceRecord.organization_id == user["org_id"])
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Servisni zapis ne obstaja")
    return record


@router.put("/{record_id}", response_model=ServiceRecordResponse)
async def update_service_record(record_id: uuid.UUID, data: ServiceRecordUpdate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(ServiceRecord).where(ServiceRecord.id == record_id, ServiceRecord.organization_id == user["org_id"])
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Servisni zapis ne obstaja")

    before = {
        "service_type": record.service_type,
        "technician": record.technician,
        "date": str(record.date),
        "items": record.items,
        "notes": record.notes,
    }

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(record, field, value)

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="service_record",
        entity_id=record.id,
        before=before,
        after={
            "service_type": record.service_type,
            "technician": record.technician,
            "date": str(record.date),
            "items": record.items,
            "notes": record.notes,
        },
    )

    await db.commit()
    await db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service_record(record_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(ServiceRecord).where(ServiceRecord.id == record_id, ServiceRecord.organization_id == user["org_id"])
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Servisni zapis ne obstaja")

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="delete",
        entity_type="service_record",
        entity_id=record.id,
        before={
            "vehicle_id": str(record.vehicle_id),
            "service_type": record.service_type,
            "technician": record.technician,
            "date": str(record.date),
            "items": record.items,
        },
    )

    await db.delete(record)
    await db.commit()
