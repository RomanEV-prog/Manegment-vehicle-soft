from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession
from app.models.organization import Organization
from app.models.user import User

router = APIRouter()


@router.get("/me")
async def get_my_organization(user: CurrentUserDep, db: DbSession):
    result = await db.execute(select(Organization).where(Organization.id == user["org_id"]))
    org = result.scalar_one_or_none()
    if not org:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Organizacija ne obstaja")
    return {"id": str(org.id), "name": org.name, "type": org.type}


@router.get("/users")
async def get_organization_users(user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(User).where(User.organization_id == user["org_id"], User.is_active == True)
    )
    users = result.scalars().all()
    return [
        {"id": str(u.id), "email": u.email, "full_name": u.full_name, "role": u.role}
        for u in users
    ]
