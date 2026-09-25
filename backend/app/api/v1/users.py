import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, require_role
from app.models.user import User
from app.utils.audit import write_audit_log
from app.utils.security import hash_password

router = APIRouter()

AdminOrQC = Depends(require_role("admin", "qc_manager"))


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: str       # 'admin' | 'qc_manager' | 'technician' | 'partner_viewer'
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


VALID_ROLES = {"admin", "qc_manager", "technician", "partner_viewer"}


@router.get("", response_model=list[UserResponse], dependencies=[AdminOrQC])
async def list_users(user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(User).where(User.organization_id == user["org_id"]).order_by(User.full_name)
    )
    return result.scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role("admin"))])
async def create_user(data: UserCreate, user: CurrentUserDep, db: DbSession):
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Neveljavna vloga. Dovoljene: {', '.join(VALID_ROLES)}")

    # Preveri edinstvenost emaila
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email že obstaja")

    new_user = User(
        organization_id=user["org_id"],
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        password_hash=hash_password(data.password),
    )
    db.add(new_user)
    await db.flush()  # id se dodeli šele ob flushu — audit log ga potrebuje

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="user",
        entity_id=new_user.id,
        after={"email": new_user.email, "full_name": new_user.full_name, "role": new_user.role},
    )

    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUserDep, db: DbSession):
    result = await db.execute(select(User).where(User.id == user["user_id"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Uporabnik ne obstaja")
    return u


class FcmTokenUpdate(BaseModel):
    fcm_token: str


@router.put("/me/fcm-token", status_code=status.HTTP_204_NO_CONTENT)
async def update_fcm_token(data: FcmTokenUpdate, user: CurrentUserDep, db: DbSession):
    """Registrira ali posodobi FCM push token za trenutnega uporabnika."""
    result = await db.execute(select(User).where(User.id == user["user_id"]))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Uporabnik ne obstaja")
    u.fcm_token = data.fcm_token
    await db.commit()


@router.put("/{user_id}", response_model=UserResponse,
            dependencies=[Depends(require_role("admin"))])
async def update_user(user_id: uuid.UUID, data: UserUpdate, user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(User).where(User.id == user_id, User.organization_id == user["org_id"])
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Uporabnik ne obstaja")

    before = {"full_name": u.full_name, "role": u.role, "is_active": u.is_active}

    if data.full_name is not None:
        u.full_name = data.full_name
    if data.role is not None:
        if data.role not in VALID_ROLES:
            raise HTTPException(status_code=422, detail="Neveljavna vloga")
        u.role = data.role
    if data.is_active is not None:
        u.is_active = data.is_active

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="user",
        entity_id=u.id,
        before=before,
        after={"full_name": u.full_name, "role": u.role, "is_active": u.is_active},
    )

    await db.commit()
    await db.refresh(u)
    return u


@router.delete("/{user_id}", response_model=UserResponse,
               dependencies=[Depends(require_role("admin"))])
async def deactivate_user(user_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    """Deaktivira (ne briše) uporabnika — ohrani audit trail."""
    if user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Ne moreš deaktivirati samega sebe")

    result = await db.execute(
        select(User).where(User.id == user_id, User.organization_id == user["org_id"])
    )
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Uporabnik ne obstaja")

    u.is_active = False

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="user",
        entity_id=u.id,
        before={"is_active": True, "email": u.email},
        after={"is_active": False, "email": u.email},
        reason="Deaktivacija uporabnika",
    )

    await db.commit()
    await db.refresh(u)
    return u
