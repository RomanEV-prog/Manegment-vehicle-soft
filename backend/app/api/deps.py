import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

DbSession = Annotated[AsyncSession, Depends(get_db)]


class CurrentUser:
    """Dependency ki vrne podatke o prijavljenem uporabniku iz JWT tokena."""

    def __call__(self, request: Request) -> dict:
        if not hasattr(request.state, "user_id"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ni avtentikacije")
        return {
            "user_id": uuid.UUID(request.state.user_id),
            "org_id": uuid.UUID(request.state.org_id),
            "role": request.state.role,
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
