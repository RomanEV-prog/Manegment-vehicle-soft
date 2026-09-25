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
async def websocket_alarms(websocket: WebSocket, token: str = ""):
    """Real-time alarmi za dashboard. JWT token v query parametru ali Sec-WebSocket-Protocol."""
    # Podpira oba načina: ?token=... ali Sec-WebSocket-Protocol: access_token,<jwt>
    ws_protocol = websocket.headers.get("sec-websocket-protocol", "")
    if not token and ws_protocol.startswith("access_token,"):
        token = ws_protocol.split(",", 1)[1].strip()

    if not token:
        await websocket.close(code=4001)
        return

    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    org_id = payload["org_id"]
    await manager.connect(websocket, org_id)

    redis = aioredis.from_url(settings.redis_url)
    pubsub = redis.pubsub()
    listener_task = None

    try:
        await pubsub.subscribe(f"alarms:{org_id}")

        import json

        async def listen():
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    await manager.broadcast_to_org(org_id, json.loads(msg["data"]))

        listener_task = asyncio.create_task(listen())

        while True:
            await websocket.receive_text()

    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        if listener_task:
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass
        manager.disconnect(websocket, org_id)
        await pubsub.unsubscribe(f"alarms:{org_id}")
        await redis.aclose()
