import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.homologation import Homologation
from app.schemas.homologation import (
    HomologationCreate,
    HomologationResponse,
    HomologationUpdate,
)
from app.utils.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[HomologationResponse])
async def list_homologations(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
):
    q = select(Homologation).where(Homologation.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(Homologation.vehicle_id == vehicle_id)
    if status:
        q = q.where(Homologation.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=HomologationResponse, status_code=status.HTTP_201_CREATED)
async def create_homologation(data: HomologationCreate, user: NonPartnerDep, db: DbSession):
    hom = Homologation(**data.model_dump(), organization_id=user["org_id"])
    db.add(hom)
    await db.flush()

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="homologation",
        entity_id=hom.id,
        after={
            "vehicle_id": str(hom.vehicle_id),
            "regulation": hom.regulation,
            "status": hom.status,
            "authority": hom.authority,
            "country": hom.country,
            "valid_until": str(hom.valid_until) if hom.valid_until else None,
            "next_action_due": str(hom.next_action_due) if hom.next_action_due else None,
        },
    )

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Homologacija za uredbo '{data.regulation}' za to vozilo že obstaja",
            )
        raise HTTPException(status_code=500, detail="Napaka pri shranjevanju")
    await db.refresh(hom)
    # Posodobi digital twin
    from app.workers.twin_worker import update_vehicle_twin
    update_vehicle_twin.delay(str(hom.vehicle_id), "homologation", str(hom.id))
    return hom


@router.put("/{hom_id}", response_model=HomologationResponse)
async def update_homologation(hom_id: uuid.UUID, data: HomologationUpdate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(Homologation).where(Homologation.id == hom_id, Homologation.organization_id == user["org_id"])
    )
    hom = result.scalar_one_or_none()
    if not hom:
        raise HTTPException(status_code=404, detail="Homologacija ne obstaja")

    before = {
        "status": hom.status,
        "authority": hom.authority,
        "country": hom.country,
        "valid_from": str(hom.valid_from) if hom.valid_from else None,
        "valid_until": str(hom.valid_until) if hom.valid_until else None,
        "next_action_due": str(hom.next_action_due) if hom.next_action_due else None,
        "notes": hom.notes,
    }

    changed_fields = data.model_dump(exclude_none=True)
    for field, value in changed_fields.items():
        setattr(hom, field, value)

    action = "approve" if data.status == "approved" else "update"

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action=action,
        entity_type="homologation",
        entity_id=hom.id,
        before=before,
        after={
            "status": hom.status,
            "authority": hom.authority,
            "country": hom.country,
            "valid_from": str(hom.valid_from) if hom.valid_from else None,
            "valid_until": str(hom.valid_until) if hom.valid_until else None,
            "next_action_due": str(hom.next_action_due) if hom.next_action_due else None,
            "notes": hom.notes,
        },
        reason=data.notes,
    )

    await db.commit()
    await db.refresh(hom)
    # Posodobi digital twin ob vsaki spremembi homologacije
    from app.workers.twin_worker import update_vehicle_twin
    update_vehicle_twin.delay(str(hom.vehicle_id), "homologation", str(hom.id))
    return hom
