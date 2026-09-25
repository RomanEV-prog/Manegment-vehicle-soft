import uuid

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.photo import Photo
from app.models.vehicle import Vehicle
from app.services.photo_service import delete_photo, upload_photo
from app.utils.audit import write_audit_log
from app.utils.storage import get_signed_url

router = APIRouter()

# Usklajeno s frontend PhotoUpload komponentom
VALID_PHOTO_TYPES = {"exterior", "interior", "damage", "service", "diagnostic", "document", "other"}
VALID_LINKED_TYPES = {"service", "dtc", "homologation", "coc", "shipment"}


@router.get("")
async def list_photos(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    linked_to_type: str | None = Query(None),
    linked_to_id: uuid.UUID | None = Query(None),
    photo_type: str | None = Query(None),
):
    q = select(Photo).where(Photo.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(Photo.vehicle_id == vehicle_id)
    if linked_to_type:
        q = q.where(Photo.linked_to_type == linked_to_type)
    if linked_to_id:
        q = q.where(Photo.linked_to_id == linked_to_id)
    if photo_type:
        q = q.where(Photo.photo_type == photo_type)

    result = await db.execute(q.order_by(Photo.taken_at.desc().nullslast()))
    photos = result.scalars().all()

    response = []
    for photo in photos:
        try:
            signed_url = get_signed_url(photo.url)
        except Exception:
            signed_url = photo.url

        response.append(
            {
                "id": str(photo.id),
                "vehicle_id": str(photo.vehicle_id),
                "linked_to_type": photo.linked_to_type,
                "linked_to_id": str(photo.linked_to_id) if photo.linked_to_id else None,
                "filename": photo.filename,
                "url": signed_url,
                "photo_type": photo.photo_type,
                "gps_lat": float(photo.gps_lat) if photo.gps_lat else None,
                "gps_lng": float(photo.gps_lng) if photo.gps_lng else None,
                "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
                "created_at": photo.created_at.isoformat(),
            }
        )

    return response


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_photo_endpoint(
    user: NonPartnerDep,
    db: DbSession,
    file: UploadFile = File(...),
    vehicle_id: uuid.UUID = Form(...),
    photo_type: str = Form("other"),
    linked_to_type: str | None = Form(None),
    linked_to_id: uuid.UUID | None = Form(None),
    gps_lat: float | None = Form(None),
    gps_lng: float | None = Form(None),
):
    # Validacija photo_type
    if photo_type not in VALID_PHOTO_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Neveljaven photo_type. Dovoljeni: {', '.join(sorted(VALID_PHOTO_TYPES))}",
        )

    # Validacija linked_to_type (opcijsko)
    if linked_to_type and linked_to_type not in VALID_LINKED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Neveljaven linked_to_type. Dovoljeni: {', '.join(sorted(VALID_LINKED_TYPES))}",
        )

    # Preveri dostop do vozila
    result = await db.execute(
        select(Vehicle).where(
            Vehicle.id == vehicle_id,
            Vehicle.organization_id == user["org_id"],
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    try:
        photo = await upload_photo(
            db=db,
            file=file,
            vehicle_id=vehicle_id,
            organization_id=user["org_id"],
            linked_to_type=linked_to_type,
            linked_to_id=linked_to_id,
            photo_type=photo_type,
            taken_by=user["user_id"],
            gps_lat=gps_lat,
            gps_lng=gps_lng,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="upload",
        entity_type="photo",
        entity_id=photo.id,
        after={
            "vehicle_id": str(photo.vehicle_id),
            "filename": photo.filename,
            "photo_type": photo.photo_type,
            "linked_to_type": photo.linked_to_type,
            "linked_to_id": str(photo.linked_to_id) if photo.linked_to_id else None,
        },
    )
    await db.commit()

    try:
        signed_url = get_signed_url(photo.url)
    except Exception:
        signed_url = photo.url

    return {
        "id": str(photo.id),
        "vehicle_id": str(photo.vehicle_id),
        "filename": photo.filename,
        "url": signed_url,
        "photo_type": photo.photo_type,
        "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
        "created_at": photo.created_at.isoformat(),
    }


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo_endpoint(
    photo_id: uuid.UUID,
    user: NonPartnerDep,
    db: DbSession,
):
    result = await db.execute(
        select(Photo).where(
            Photo.id == photo_id,
            Photo.organization_id == user["org_id"],
        )
    )
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Fotografija ne obstaja")

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="delete",
        entity_type="photo",
        entity_id=photo.id,
        before={
            "vehicle_id": str(photo.vehicle_id),
            "filename": photo.filename,
            "photo_type": photo.photo_type,
        },
    )

    await delete_photo(db, photo)
