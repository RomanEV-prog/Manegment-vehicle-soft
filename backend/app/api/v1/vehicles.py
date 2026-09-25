import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.database import Base
from app.models.vehicle import Vehicle
from app.models.vehicle_twin import VehicleTwin
from app.models.twin_snapshot import TwinSnapshot
from app.schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate, VehicleTwinResponse
from app.utils.audit import write_audit_log

router = APIRouter()


async def _check_vehicle_type(db, vehicle_type_id: uuid.UUID | None, org_id) -> None:
    if vehicle_type_id is None:
        return
    from app.models.r156 import VehicleType
    exists = await db.scalar(
        select(VehicleType.id).where(VehicleType.id == vehicle_type_id, VehicleType.organization_id == org_id)
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Tip vozila ne obstaja")


@router.get("", response_model=list[VehicleResponse])
async def list_vehicles(
    user: CurrentUserDep,
    db: DbSession,
    status: str | None = Query(None),
    project_name: str | None = Query(None),
    search: str | None = Query(None),
    vehicle_type_id: uuid.UUID | None = Query(None),
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
):
    q = select(Vehicle).where(Vehicle.organization_id == user["org_id"])
    if status:
        q = q.where(Vehicle.status == status)
    if project_name:
        q = q.where(Vehicle.project_name.ilike(f"%{project_name}%"))
    if vehicle_type_id:
        q = q.where(Vehicle.vehicle_type_id == vehicle_type_id)
    if search:
        term = f"%{search}%"
        q = q.where(or_(
            Vehicle.name.ilike(term),
            Vehicle.vin.ilike(term),
            Vehicle.model.ilike(term),
        ))
    result = await db.execute(q.order_by(Vehicle.name).limit(limit).offset(offset))
    return result.scalars().all()


@router.post("", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle(data: VehicleCreate, user: NonPartnerDep, db: DbSession):
    if await db.scalar(select(Vehicle.id).where(Vehicle.vin == data.vin)):
        raise HTTPException(status_code=409, detail=f"Vozilo z VIN {data.vin} že obstaja")
    await _check_vehicle_type(db, data.vehicle_type_id, user["org_id"])
    vehicle = Vehicle(**data.model_dump(), organization_id=user["org_id"])
    db.add(vehicle)
    await db.flush()
    # Ustvari prazen twin
    twin = VehicleTwin(vehicle_id=vehicle.id)
    db.add(twin)
    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="vehicle",
        entity_id=vehicle.id,
        after={
            "name": vehicle.name,
            "vin": vehicle.vin,
            "model": vehicle.model,
            "year": vehicle.year,
            "project_name": vehicle.project_name,
            "status": vehicle.status,
            "vehicle_type_id": str(vehicle.vehicle_type_id) if vehicle.vehicle_type_id else None,
        },
    )
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(vehicle_id: uuid.UUID, data: VehicleUpdate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    if data.vehicle_type_id is not None:
        await _check_vehicle_type(db, data.vehicle_type_id, user["org_id"])
    prev_status = vehicle.status
    before = {"status": vehicle.status, "name": vehicle.name,
              "vehicle_type_id": str(vehicle.vehicle_type_id) if vehicle.vehicle_type_id else None}
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(vehicle, field, value)

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="vehicle",
        entity_id=vehicle.id,
        before=before,
        after={"status": vehicle.status, "name": vehicle.name,
               "vehicle_type_id": str(vehicle.vehicle_type_id) if vehicle.vehicle_type_id else None},
    )

    await db.commit()
    await db.refresh(vehicle)

    # Ob odpremi sproži shipment snapshot
    if data.status == "shipped" and prev_status != "shipped":
        import asyncio
        from app.utils.events import publish_event
        asyncio.create_task(publish_event(
            "vehicle.shipped",
            vehicle_id=vehicle.id,
            org_id=user["org_id"],
        ))

    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(vehicle_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    """Izbriše vozilo (samo admin)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Samo admin lahko briše vozila")
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    # R156 §7.1.1: zapisov o vozilu ne smemo izgubiti. Vozilo z zgodovino se
    # ne briše, ampak označi kot 'decommissioned'. Dvojček in posnetki niso
    # zgodovina — ustvarijo se samodejno ob vnosu vozila.
    derived = {VehicleTwin.__table__, TwinSnapshot.__table__}
    for table in Base.metadata.sorted_tables:
        if table in derived:
            continue
        for fk in table.foreign_keys:
            if fk.column.table is Vehicle.__table__:
                exists = await db.scalar(
                    select(func.count()).select_from(table).where(fk.parent == vehicle.id)
                )
                if exists:
                    raise HTTPException(
                        status_code=409,
                        detail="Vozilo ima zgodovino zapisov in ga ni mogoče izbrisati — "
                               "nastavi status 'decommissioned'.",
                    )

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="delete",
        entity_type="vehicle",
        entity_id=vehicle.id,
        before={"name": vehicle.name, "vin": vehicle.vin, "status": vehicle.status},
    )

    await db.execute(delete(TwinSnapshot).where(TwinSnapshot.vehicle_id == vehicle.id))
    await db.execute(delete(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle.id))
    await db.execute(delete(Vehicle).where(Vehicle.id == vehicle.id))
    db.expunge(vehicle)
    await db.commit()


@router.get("/{vehicle_id}/twin", response_model=VehicleTwinResponse)
async def get_vehicle_twin(vehicle_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    # Preveri dostop do vozila
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    result = await db.execute(select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle_id))
    twin = result.scalar_one_or_none()
    if not twin:
        raise HTTPException(status_code=404, detail="Digital twin ne obstaja")
    return twin


@router.get("/{vehicle_id}/snapshots")
async def get_vehicle_snapshots(
    vehicle_id: uuid.UUID,
    user: CurrentUserDep,
    db: DbSession,
    limit: int = Query(20, le=100),
):
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    result = await db.execute(
        select(TwinSnapshot)
        .where(TwinSnapshot.vehicle_id == vehicle_id)
        .order_by(TwinSnapshot.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/{vehicle_id}/snapshot", status_code=status.HTTP_201_CREATED)
async def create_manual_snapshot(vehicle_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    """Ročni snapshot — ob odpremi vozila."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    result = await db.execute(select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle_id))
    twin = result.scalar_one_or_none()

    snapshot_data = {
        "ecu_config": twin.ecu_config if twin else {},
        "hom_status": twin.hom_status if twin else {},
        "active_dtcs": twin.active_dtcs if twin else [],
        "vehicle": {"vin": vehicle.vin, "name": vehicle.name, "status": vehicle.status},
    }

    snapshot = TwinSnapshot(
        vehicle_id=vehicle_id,
        organization_id=user["org_id"],
        snapshot=snapshot_data,
        trigger_type="manual",
        trigger_label=f"Ročni snapshot — {vehicle.name}",
        created_by=user["user_id"],
    )
    db.add(snapshot)

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="snapshot",
        entity_type="vehicle_twin",
        entity_id=vehicle_id,
        after={
            "vehicle_name": vehicle.name,
            "vehicle_vin": vehicle.vin,
            "trigger_type": "manual",
            "ecu_modules": len(snapshot_data["ecu_config"]),
        },
    )

    await db.commit()
    await db.refresh(snapshot)
    return snapshot


@router.get("/{vehicle_id}/stats")
async def get_vehicle_stats(vehicle_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    """Aggregated stats za vehicle detail header."""
    from sqlalchemy import func
    from app.models.sw_update import SWUpdate
    from app.models.dtc_record import DTCRecord
    from app.models.service_record import ServiceRecord
    from app.models.homologation import Homologation

    # Preveri dostop
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    async def count(model, extra_filter=None):
        q = select(func.count()).select_from(model).where(model.vehicle_id == vehicle_id)
        if extra_filter is not None:
            q = q.where(extra_filter)
        r = await db.execute(q)
        return r.scalar() or 0

    sw_count = await count(SWUpdate)
    dtc_active = await count(DTCRecord, DTCRecord.status == "active")
    dtc_high = await count(DTCRecord, (DTCRecord.status == "active") & (DTCRecord.severity == "high"))
    service_count = await count(ServiceRecord)
    hom_approved = await count(Homologation, Homologation.status == "approved")
    hom_pending = await count(Homologation, Homologation.status.in_(["pending", "in_progress"]))

    return {
        "sw_updates": sw_count,
        "dtc_active": dtc_active,
        "dtc_high": dtc_high,
        "service_records": service_count,
        "hom_approved": hom_approved,
        "hom_pending": hom_pending,
    }
