"""
Event service — Redis Streams producer.
Vsak poseg odda event na event bus.
"""
import json
import uuid

import redis.asyncio as aioredis

from app.config import settings

STREAM_KEY = "eversum:events"


async def emit_event(event_type: str, vehicle_id: uuid.UUID, org_id: uuid.UUID, **kwargs) -> None:
    """Odda event na Redis Streams."""
    redis = aioredis.from_url(settings.redis_url)
    try:
        fields = {
            "type": event_type,
            "vehicle_id": str(vehicle_id),
            "org_id": str(org_id),
            **{k: str(v) for k, v in kwargs.items()},
        }
        await redis.xadd(STREAM_KEY, fields)
    finally:
        await redis.aclose()
