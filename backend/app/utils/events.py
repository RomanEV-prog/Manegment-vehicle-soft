"""
Event publisher — piše evente v Redis Streams.
Routerji klicejo publish_event() po uspešnem DB write.
"""
import json
import logging
import uuid
from typing import Any

from app.config import settings

log = logging.getLogger(__name__)

STREAM_KEY = "eversum:events"
MAX_STREAM_LEN = 10_000  # MAXLEN za avtomatsko rezanje streama


async def publish_event(
    event_type: str,
    vehicle_id: uuid.UUID | str,
    org_id: uuid.UUID | str,
    trigger_id: uuid.UUID | str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Objavi event na Redis Stream.

    Args:
        event_type: 'sw_update.created' | 'dtc.created' | 'dtc.resolved' |
                    'service.created' | 'homologation.updated' | 'vehicle.shipped'
        vehicle_id: UUID vozila
        org_id: UUID organizacije
        trigger_id: UUID objekta ki je sprožil event
        extra: Dodatna polja (npr. severity za DTC)
    """
    import redis.asyncio as aioredis

    fields: dict[str, str] = {
        "type": event_type,
        "vehicle_id": str(vehicle_id),
        "org_id": str(org_id),
    }
    if trigger_id:
        fields["trigger_id"] = str(trigger_id)
    if extra:
        for k, v in extra.items():
            fields[k] = str(v)

    try:
        redis = aioredis.from_url(settings.redis_url)
        try:
            await redis.xadd(STREAM_KEY, fields, maxlen=MAX_STREAM_LEN, approximate=True)
            log.debug(f"Event published: {event_type} vehicle={vehicle_id}")
        finally:
            await redis.aclose()
    except Exception as e:
        # Event bus napaka ne sme blokirati API response
        log.error(f"Napaka pri publish eventa {event_type}: {e}")
