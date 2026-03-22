"""
Photo service — upload/download/delete iz MinIO.
"""
import uuid
from datetime import datetime, timezone

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.photo import Photo
from app.utils.storage import upload_file, get_signed_url, delete_file, ensure_bucket_exists


ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/jpg", "image/png",
    "image/webp", "image/heic", "image/heif",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


async def upload_photo(
    db: AsyncSession,
    file: UploadFile,
    vehicle_id: uuid.UUID,
    organization_id: uuid.UUID,
    photo_type: str,
    linked_to_type: str | None = None,
    linked_to_id: uuid.UUID | None = None,
    taken_by: uuid.UUID | None = None,
    notes: str | None = None,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
) -> Photo:
    """Upload slike v MinIO in shrani metapodatke v DB."""

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Nepodprt tip datoteke: {file.content_type}. "
            f"Dovoljeni: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValueError(f"Datoteka je prevelika (max {MAX_FILE_SIZE // 1024 // 1024} MB)")

    ensure_bucket_exists()

    # Ključ v MinIO: photos/{org_id}/{vehicle_id}/{uuid}.{ext}
    filename = file.filename or "photo"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    object_key = f"photos/{organization_id}/{vehicle_id}/{uuid.uuid4()}.{ext}"

    upload_file(object_key, content, file.content_type)

    photo = Photo(
        vehicle_id=vehicle_id,
        organization_id=organization_id,
        linked_to_type=linked_to_type,
        linked_to_id=linked_to_id,
        filename=filename,
        url=object_key,         # Shranjujemo key, ne signed URL (ki poteče)
        photo_type=photo_type,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        taken_at=datetime.now(timezone.utc),
        taken_by=taken_by,
        notes=notes,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


async def delete_photo(db: AsyncSession, photo: Photo) -> None:
    """Pobriši sliko iz MinIO in DB."""
    try:
        delete_file(photo.url)
    except Exception:
        pass  # Nadaljuj tudi če MinIO briše ne uspe
    await db.delete(photo)
    await db.commit()
