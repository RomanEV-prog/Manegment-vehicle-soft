from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    verify_password,
)
from app.utils import login_limit
from app.utils.audit import write_audit_log

router = APIRouter()

# Refresh žeton v httpOnly piškotu — JavaScript (in morebiten XSS) ga ne more prebrati.
# Pot je omejena na /api/v1/auth, zato se ne pošilja z drugimi zahtevki.
REFRESH_COOKIE = "sums_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def set_refresh_cookie(response: Response, token: str) -> None:
    from app.config import settings

    response.set_cookie(
        REFRESH_COOKIE,
        token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
        max_age=settings.refresh_token_expire_days * 86400,
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, response: Response, data: LoginRequest, db: DbSession):
    client_ip = request.client.host if request.client else None
    wait = login_limit.retry_after(data.email, client_ip)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Preveč neuspelih prijav — poskusi znova čez nekaj minut",
            headers={"Retry-After": str(wait)},
        )

    result = await db.execute(select(User).where(User.email == data.email, User.is_active.is_(True)))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        login_limit.record_failure(data.email, client_ip)
        if user:
            # neuspela prijava na obstoječ račun — sled za presojo in odkrivanje napadov
            await write_audit_log(
                db=db,
                org_id=user.organization_id,
                actor_id=None,
                actor_type="system",
                actor_device="web",
                actor_ip=client_ip,
                action="login_failed",
                entity_type="user",
                entity_id=user.id,
                after={"email": user.email},
            )
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Napačen email ali geslo",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = {
        "sub": str(user.id),
        "org_id": str(user.organization_id),
        "role": user.role,
    }

    login_limit.record_success(data.email)

    # Audit log — R156 §7.4: sledenje prijav
    await write_audit_log(
        db=db,
        org_id=user.organization_id,
        actor_id=user.id,
        actor_type="user",
        actor_device="web",
        actor_ip=client_ip,
        action="login",
        entity_type="user",
        entity_id=user.id,
        after={"email": user.email, "role": user.role},
    )
    await db.commit()

    refresh = create_refresh_token(token_data)
    set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=create_access_token(token_data), refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response, db: DbSession, data: RefreshRequest | None = None):
    token = (data.refresh_token if data else None) or request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ni seje")
    payload = decode_refresh_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neveljaven refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"], User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Uporabnik ne obstaja")
    # po menjavi gesla stare seje ne smejo več podaljševati žetonov
    issued = payload.get("iat")
    if user.password_changed_at and (issued is None or issued < int(user.password_changed_at.timestamp())):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Seja je potekla — prijavi se znova")

    token_data = {
        "sub": str(user.id),
        "org_id": str(user.organization_id),
        "role": user.role,
    }

    refresh = create_refresh_token(token_data)  # rotacija ob vsakem osveževanju
    set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=create_access_token(token_data), refresh_token=refresh)


@router.post("/logout")
async def logout(request: Request, response: Response, db: DbSession):
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        payload = decode_access_token(token)
        if payload:
            client_ip = request.client.host if request.client else None
            await write_audit_log(
                db=db,
                org_id=payload["org_id"],
                actor_id=payload["sub"],
                actor_type="user",
                actor_device="web",
                actor_ip=client_ip,
                action="logout",
                entity_type="user",
                entity_id=payload["sub"],
            )
            await db.commit()
    return {"detail": "Odjava uspešna"}
