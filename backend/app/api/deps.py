import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

DbSession = Annotated[AsyncSession, Depends(get_db)]


class CurrentUser:
    """
    Prijavljeni uporabnik iz JWT, preverjen v bazi: deaktiviran uporabnik ali
    žeton, izdan pred menjavo gesla, se zavrne takoj (ne šele ob poteku žetona).
    Vloga se vzame iz baze — sprememba vloge velja takoj.
    """

    async def __call__(self, request: Request, db: DbSession) -> dict:
        if not hasattr(request.state, "user_id"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ni avtentikacije")
        from sqlalchemy import select

        from app.models.user import User

        row = (
            await db.execute(
                select(User.is_active, User.role, User.password_changed_at, User.organization_id).where(
                    User.id == uuid.UUID(request.state.user_id)
                )
            )
        ).first()
        if not row or not row.is_active or str(row.organization_id) != request.state.org_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Seja ni več veljavna")
        issued = getattr(request.state, "iat", None)
        if row.password_changed_at and (issued is None or issued < int(row.password_changed_at.timestamp())):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Seja je potekla — prijavi se znova")
        return {
            "user_id": uuid.UUID(request.state.user_id),
            "org_id": row.organization_id,
            "role": row.role,
        }


get_current_user = CurrentUser()
CurrentUserDep = Annotated[dict, Depends(get_current_user)]


def require_role(*roles: str):
    """Dependency factory za preverjanje vloge."""

    def _check(user: CurrentUserDep):
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Zahtevana vloga: {', '.join(roles)}",
            )
        return user

    return _check


# Partner viewer ima samo bralni dostop — blokiraj vse pisalne operacije
NonPartnerDep = Annotated[dict, Depends(require_role("admin", "qc_manager", "technician"))]
