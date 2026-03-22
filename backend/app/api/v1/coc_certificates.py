import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.coc_certificate import CoCCertificate
from app.schemas.homologation import CoCCertificateCreate, CoCCertificateResponse
from app.utils.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[CoCCertificateResponse])
async def list_coc_certificates(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
):
    q = select(CoCCertificate).where(CoCCertificate.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(CoCCertificate.vehicle_id == vehicle_id)
    result = await db.execute(q.order_by(CoCCertificate.issued_at.desc()))
    return result.scalars().all()


@router.post("", response_model=CoCCertificateResponse, status_code=status.HTTP_201_CREATED)
async def create_coc_certificate(data: CoCCertificateCreate, user: NonPartnerDep, db: DbSession):
    coc = CoCCertificate(**data.model_dump(), organization_id=user["org_id"], created_by=user["user_id"])
    db.add(coc)
    await db.flush()

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="coc_certificate",
        entity_id=coc.id,
        after={
            "vehicle_id": str(coc.vehicle_id),
            "coc_number": coc.coc_number,
            "issued_at": str(coc.issued_at) if coc.issued_at else None,
            "issuing_body": coc.issuing_body,
        },
    )

    await db.commit()
    await db.refresh(coc)
    return coc
