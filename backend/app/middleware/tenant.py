from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.utils.security import decode_access_token

# Poti ki ne zahtevajo autentikacije
PUBLIC_PATHS = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
}


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Vsak DB query avtomatsko filtrira po org_id.
    JWT token → request.state.org_id, role, user_id
    """

    async def dispatch(self, request: Request, call_next):
        # Preskoči javne poti
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/ws/"):
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

        return await call_next(request)
