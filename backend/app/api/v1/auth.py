from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DbSession
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserMe
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_password,
)
from app.utils.audit import write_audit_log

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, data: LoginRequest, db: DbSession):
    result = await db.execute(select(User).where(User.email == data.email, User.is_active == True))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
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

    # Audit log — R156 §7.4: sledenje prijav
    client_ip = request.client.host if request.client else None
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

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshRequest, db: DbSession):
    payload = decode_refresh_token(data.refresh_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neveljaven refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"], User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Uporabnik ne obstaja")

    token_data = {
        "sub": str(user.id),
        "org_id": str(user.organization_id),
        "role": user.role,
    }

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/logout")
async def logout():
    # Stateless JWT — client pobriše token
    return {"detail": "Odjava uspešna"}
