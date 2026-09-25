from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.utils.security import decode_access_token

# Poti ki ne zahtevajo autentikacije
PUBLIC_PATHS = {
    "/health",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",   # odjava mora izbrisati piškot tudi, ko je dostopni žeton že potekel
}

# Dev-only dokumentacija (v produkciji je FastAPI ne servira)
_DEV_DOC_PATHS = {"/docs", "/redoc", "/openapi.json"}


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Vsak DB query avtomatsko filtrira po org_id.
    JWT token → request.state.org_id, role, user_id
    """

    async def dispatch(self, request: Request, call_next):
        # Preskoči javne poti
        if request.url.path in PUBLIC_PATHS or request.url.path in _DEV_DOC_PATHS or request.url.path.startswith("/ws/"):
            return await call_next(request)

        # ERP integracija: endpoint sam preveri X-API-Key (app/api/v1/integration.py)
        if request.url.path.startswith("/api/v1/integration/") and request.headers.get("X-API-Key"):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=401,
                content={"detail": "Manjka JWT token", "code": "MISSING_TOKEN"},
            )

        token = auth_header.split(" ")[1]
        payload = decode_access_token(token)

        if payload is None:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=401,
                content={"detail": "Neveljaven ali potekel token", "code": "INVALID_TOKEN"},
            )

        request.state.org_id = payload.get("org_id")
        request.state.role = payload.get("role")
        request.state.user_id = payload.get("sub")
        request.state.iat = payload.get("iat")

        return await call_next(request)
