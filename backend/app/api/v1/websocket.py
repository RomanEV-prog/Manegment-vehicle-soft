import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import redis.asyncio as aioredis

from app.config import settings
from app.utils.security import decode_access_token

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        # org_id → set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, org_id: str):
        await websocket.accept()
        if org_id not in self._connections:
            self._connections[org_id] = set()
        self._connections[org_id].add(websocket)

    def disconnect(self, websocket: WebSocket, org_id: str):
        if org_id in self._connections:
            self._connections[org_id].discard(websocket)

    async def broadcast_to_org(self, org_id: str, message: dict):
        if org_id not in self._connections:
            return
        dead = set()
        for ws in self._connections[org_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[org_id].discard(ws)


manager = ConnectionManager()


@router.websocket("/alarms")
async def websocket_alarms(websocket: WebSocket, token: str):
    """Real-time alarmi za dashboard. JWT token v query parametru."""
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    org_id = payload["org_id"]
    await manager.connect(websocket, org_id)

    try:
        # Subscribe na Redis pub/sub kanal za to organizacijo
        redis = aioredis.from_url(settings.redis_url)
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"alarms:{org_id}")

        async def listen():
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    import json
                    await manager.broadcast_to_org(org_id, json.loads(msg["data"]))

        listener_task = asyncio.create_task(listen())

        while True:
            # Drži WebSocket živ
            await websocket.receive_text()

    except WebSocketDisconnect:
        listener_task.cancel()
        manager.disconnect(websocket, org_id)
        await pubsub.unsubscribe(f"alarms:{org_id}")
        await redis.aclose()
