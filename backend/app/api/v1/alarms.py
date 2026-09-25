import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, update

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.alarm_event import AlarmEvent
from app.models.alarm_config import AlarmConfig
from app.schemas.alarm import AlarmConfigCreate, AlarmConfigResponse, AlarmEventResponse
from app.utils.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[AlarmEventResponse])
async def list_alarms(
    user: CurrentUserDep,
    db: DbSession,
    is_read: bool | None = Query(None),
    severity: str | None = Query(None),
    alarm_type: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    q = select(AlarmEvent).where(AlarmEvent.organization_id == user["org_id"])
    if is_read is not None:
        q = q.where(AlarmEvent.is_read == is_read)
    if severity:
        q = q.where(AlarmEvent.severity == severity)
    if alarm_type:
        q = q.where(AlarmEvent.alarm_type == alarm_type)
    result = await db.execute(q.order_by(AlarmEvent.created_at.desc()).limit(limit).offset(offset))
    return result.scalars().all()


@router.patch("/{alarm_id}/read")
async def mark_alarm_read(alarm_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(AlarmEvent).where(
            AlarmEvent.id == alarm_id,
            AlarmEvent.organization_id == user["org_id"],
        )
    )
    alarm = result.scalar_one_or_none()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm ne obstaja")
    alarm.is_read = True
    await db.commit()
    return {"detail": "Prebrano"}


@router.post("/mark-all-read")
async def mark_all_alarms_read(user: CurrentUserDep, db: DbSession):
    await db.execute(
        update(AlarmEvent)
        .where(
            AlarmEvent.organization_id == user["org_id"],
            AlarmEvent.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"detail": "Vsi alarmi označeni kot prebrani"}


@router.get("/configs", response_model=list[AlarmConfigResponse])
async def list_alarm_configs(user: CurrentUserDep, db: DbSession):
    result = await db.execute(select(AlarmConfig).where(AlarmConfig.organization_id == user["org_id"]))
    return result.scalars().all()


@router.post("/configs", response_model=AlarmConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_alarm_config(data: AlarmConfigCreate, user: NonPartnerDep, db: DbSession):
    config = AlarmConfig(**data.model_dump(), organization_id=user["org_id"])
    db.add(config)
    await db.flush()  # id in privzete vrednosti se dodelijo šele ob flushu

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="alarm_config",
        entity_id=config.id,
        after={
            "alarm_type": config.alarm_type,
            "is_active": config.is_active,
            "channels": config.channels,
            "recipient_roles": config.recipient_roles,
        },
    )

    await db.commit()
    await db.refresh(config)
    return config


@router.put("/configs/{config_id}", response_model=AlarmConfigResponse)
async def update_alarm_config(
    config_id: uuid.UUID,
    data: AlarmConfigCreate,
    user: NonPartnerDep,
    db: DbSession,
):
    result = await db.execute(
        select(AlarmConfig).where(
            AlarmConfig.id == config_id,
            AlarmConfig.organization_id == user["org_id"],
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Konfiguracija ne obstaja")

    before = {
        "alarm_type": config.alarm_type,
        "is_active": config.is_active,
        "channels": config.channels,
        "recipient_roles": config.recipient_roles,
    }

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(config, field, value)

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="alarm_config",
        entity_id=config.id,
        before=before,
        after={
            "alarm_type": config.alarm_type,
            "is_active": config.is_active,
            "channels": config.channels,
            "recipient_roles": config.recipient_roles,
        },
    )

    await db.commit()
    await db.refresh(config)
    return config
