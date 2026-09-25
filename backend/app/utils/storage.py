from datetime import timedelta
from minio import Minio
from minio.error import S3Error

from app.config import settings

_client: Minio | None = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
    return _client


def ensure_bucket_exists() -> None:
    client = get_minio_client()
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except S3Error as e:
        raise RuntimeError(f"MinIO bucket napaka: {e}")


def get_signed_url(object_key: str, expires_hours: int = 1) -> str:
    client = get_minio_client()
    return client.presigned_get_object(
        bucket_name=settings.minio_bucket,
        object_name=object_key,
        expires=timedelta(hours=expires_hours),
    )


def upload_file(object_key: str, file_data: bytes, content_type: str = "application/octet-stream") -> str:
    import io

    client = get_minio_client()
    client.put_object(
        bucket_name=settings.minio_bucket,
        object_name=object_key,
        data=io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )
    return object_key


def delete_file(object_key: str) -> None:
    client = get_minio_client()
    client.remove_object(settings.minio_bucket, object_key)
