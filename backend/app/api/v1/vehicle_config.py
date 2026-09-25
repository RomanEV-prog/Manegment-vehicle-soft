"""
Konfiguracija vozila po VIN (R156 §7.1.2.2, §7.1.1.7):
  - vgrajeni ECU-ji (serijska številka, HW verzija, batch)
  - konfiguracija ob koncu linije (Initial EOL Configuration) — enkrat na vozilo
  - zgodovina zadnjih znanih konfiguracij (Last Known Configuration)
Zadnja znana konfiguracija nastane samodejno ob uspešni izvedbi Software Update
dokumenta (app/api/v1/su_documents.py) in ob zamenjavi ECU strojne opreme.
"""

import uuid
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.r156 import ECU, RXSWIN, RXSWINBaseline, SoftwareUpdateDocument, VehicleConfiguration, VehicleECU, VehicleType
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.vehicle_config import current_configuration, installed_baselines, record_configuration
from app.utils.audit import write_audit_log

router = APIRouter()


class EcuInstanceIn(BaseModel):
    ecu_id: uuid.UUID
    serial_number: Optional[str] = None
    hardware_version: Optional[str] = None
    batch_number: Optional[str] = None


class EcuInstancesUpdate(BaseModel):
    instances: list[EcuInstanceIn]


class EolBaseline(BaseModel):
    rxswin_id: uuid.UUID
    baseline_id: uuid.UUID


class EolCreate(BaseModel):
    rxswin_baselines: list[EolBaseline] = Field(min_length=1)
    config_id: Optional[str] = None
    system_schemes_baseline: Optional[str] = None
    vv_status: Literal["pass", "fail", "pending"] = "pass"
    erp_work_order: Optional[str] = None


class EcuInstanceOut(BaseModel):
    ecu_id: uuid.UUID
    ecu_name: str
    part_number: str
    serial_number: Optional[str]
    hardware_version: Optional[str]
    batch_number: Optional[str]


class ConfigOut(BaseModel):
    id: uuid.UUID
    config_type: str
    config_id: Optional[str]
    reason: Optional[str]
    snapshot: dict
    system_schemes_baseline: Optional[str]
    vv_status: Optional[str]
    erp_work_order: Optional[str]
    software_update_id: Optional[uuid.UUID]
    created_by_name: Optional[str]
    created_at: datetime


class VehicleR156(BaseModel):
    id: uuid.UUID
    vin: str
    name: str
    year: int
    status: str
    vehicle_type_id: Optional[uuid.UUID]
    vehicle_type_name: Optional[str]
    ecu_instances: list[EcuInstanceOut]
    has_eol: bool
    current: Optional[ConfigOut]
    history: list[ConfigOut]


async def _vehicle(db, vehicle_id: uuid.UUID, org_id) -> Vehicle:
    v = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id))
    if not v:
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")
    return v


async def configs_out(db, configs: list[VehicleConfiguration]) -> list[ConfigOut]:
    ids = {c.created_by for c in configs if c.created_by}
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))).all()) if ids else {}
    return [
        ConfigOut(
            id=c.id, config_type=c.config_type, config_id=c.config_id, reason=c.reason, snapshot=c.snapshot,
            system_schemes_baseline=c.system_schemes_baseline, vv_status=c.vv_status, erp_work_order=c.erp_work_order,
            software_update_id=c.software_update_id, created_by_name=names.get(c.created_by), created_at=c.created_at,
        )
        for c in configs
    ]


async def _detail(db, v: Vehicle) -> VehicleR156:
    vt = await db.get(VehicleType, v.vehicle_type_id) if v.vehicle_type_id else None
    instances = []
    if vt:
        ecus = (await db.execute(select(ECU).where(ECU.vehicle_type_id == vt.id).order_by(ECU.ecu_name))).scalars().all()
        existing = {ve.ecu_id: ve for ve in (await db.execute(
            select(VehicleECU).where(VehicleECU.vehicle_id == v.id))).scalars()}
        for e in ecus:
            ve = existing.get(e.id)
            instances.append(EcuInstanceOut(
                ecu_id=e.id, ecu_name=e.ecu_name, part_number=e.eversum_part_number,
                serial_number=ve.serial_number if ve else None,
                hardware_version=ve.hardware_version if ve else None,
                batch_number=ve.batch_number if ve else None,
            ))
    configs = (await db.execute(
        select(VehicleConfiguration).where(VehicleConfiguration.vehicle_id == v.id)
        .order_by(VehicleConfiguration.created_at.desc(), VehicleConfiguration.id.desc())
    )).scalars().all()
    history = await configs_out(db, list(configs))
    return VehicleR156(
        id=v.id, vin=v.vin, name=v.name, year=v.year, status=v.status,
        vehicle_type_id=v.vehicle_type_id, vehicle_type_name=vt.name if vt else None,
        ecu_instances=instances, has_eol=any(c.config_type == "initial_eol" for c in configs),
        current=history[0] if history else None, history=history,
    )


@router.get("/{vehicle_id}/r156", response_model=VehicleR156)
async def get_vehicle_r156(vehicle_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    return await _detail(db, await _vehicle(db, vehicle_id, user["org_id"]))


@router.put("/{vehicle_id}/ecu-instances", response_model=VehicleR156)
async def update_ecu_instances(vehicle_id: uuid.UUID, data: EcuInstancesUpdate, user: NonPartnerDep, db: DbSession):
    """Serijske številke in HW verzije vgrajenih ECU. Sprememba po EOL = nova zadnja znana konfiguracija."""
    v = await _vehicle(db, vehicle_id, user["org_id"])
    if not v.vehicle_type_id:
        raise HTTPException(status_code=422, detail="Vozilo nima tipa vozila")
    ecus = {e.id: e for e in (await db.execute(select(ECU).where(ECU.vehicle_type_id == v.vehicle_type_id))).scalars()}
    existing = {ve.ecu_id: ve for ve in (await db.execute(
        select(VehicleECU).where(VehicleECU.vehicle_id == v.id))).scalars()}

    changes = []
    for inst in data.instances:
        if inst.ecu_id not in ecus:
            raise HTTPException(status_code=422, detail="ECU ne pripada tipu vozila")
        new = {k: (getattr(inst, k) or None) for k in ("serial_number", "hardware_version", "batch_number")}
        ve = existing.get(inst.ecu_id)
        old = {k: getattr(ve, k) for k in new} if ve else {k: None for k in new}
        if old == new:
            continue
        if ve is None:
            ve = VehicleECU(organization_id=v.organization_id, vehicle_id=v.id, ecu_id=inst.ecu_id)
            db.add(ve)
        for k, val in new.items():
            setattr(ve, k, val)
        changes.append({"ecu": ecus[inst.ecu_id].ecu_name, "before": old, "after": new})

    if changes:
        await db.flush()
        await write_audit_log(
            db=db, org_id=user["org_id"], actor_id=user["user_id"], actor_type="user", actor_device="web",
            action="update", entity_type="vehicle_ecu", entity_id=v.id,
            before={c["ecu"]: c["before"] for c in changes}, after={"vin": v.vin, **{c["ecu"]: c["after"] for c in changes}},
        )
        current = await current_configuration(db, v.id)
        if current:
            cfg = await record_configuration(
                db, v, config_type="last_known", installed=installed_baselines(current),
                reason="ECU hardware change: " + ", ".join(c["ecu"] for c in changes), user_id=user["user_id"],
            )
            await _audit_config(db, user, v, cfg)
        await db.commit()
    return await _detail(db, v)


async def _audit_config(db, user: dict, v: Vehicle, cfg: VehicleConfiguration) -> None:
    await write_audit_log(
        db=db, org_id=user["org_id"], actor_id=user["user_id"], actor_type="user", actor_device="web",
        action="create", entity_type="vehicle_configuration", entity_id=cfg.id,
        after={"vin": v.vin, "config_type": cfg.config_type, "config_id": cfg.config_id, "reason": cfg.reason,
               "rxswins": [f"{r['rxswin']} B{r['baseline_number']}" for r in cfg.snapshot.get("rxswins", [])]},
    )


@router.post("/{vehicle_id}/configurations/eol", response_model=VehicleR156, status_code=status.HTTP_201_CREATED)
async def create_eol_configuration(vehicle_id: uuid.UUID, data: EolCreate, user: NonPartnerDep, db: DbSession):
    """Initial End of Line Configuration — enkrat na vozilo, iz izdanih (tudi nadomeščenih) baseline-ov."""
    v = await _vehicle(db, vehicle_id, user["org_id"])
    if not v.vehicle_type_id:
        raise HTTPException(status_code=422, detail="Vozilo nima tipa vozila")
    if await db.scalar(select(VehicleConfiguration.id).where(
        VehicleConfiguration.vehicle_id == v.id, VehicleConfiguration.config_type == "initial_eol"
    )):
        raise HTTPException(status_code=409, detail="Vozilo že ima konfiguracijo ob koncu linije")

    installed: dict[str, str] = {}
    for rb in data.rxswin_baselines:
        b = await db.scalar(
            select(RXSWINBaseline).join(RXSWIN, RXSWIN.id == RXSWINBaseline.rxswin_id).where(
                RXSWINBaseline.id == rb.baseline_id, RXSWINBaseline.rxswin_id == rb.rxswin_id,
                RXSWIN.vehicle_type_id == v.vehicle_type_id, RXSWIN.organization_id == user["org_id"],
            )
        )
        if not b:
            raise HTTPException(status_code=422, detail="Baseline ne pripada RXSWIN-u tega tipa vozila")
        # vozilo, izdelano prej, ima lahko starejši (že nadomeščen) baseline — osnutek pa nikoli
        if b.status == "draft":
            raise HTTPException(status_code=422, detail=f"Baseline {b.baseline_number} ni izdan")
        installed[str(rb.rxswin_id)] = str(rb.baseline_id)

    cfg = await record_configuration(
        db, v, config_type="initial_eol", installed=installed, reason="End of line",
        user_id=user["user_id"], config_id=data.config_id or f"EOL-{v.vin}",
        system_schemes_baseline=data.system_schemes_baseline, vv_status=data.vv_status,
        erp_work_order=data.erp_work_order,
    )
    await _audit_config(db, user, v, cfg)
    await db.commit()
    return await _detail(db, v)


async def su_label(db, su_id: uuid.UUID | None) -> str | None:
    if not su_id:
        return None
    row = (await db.execute(select(SoftwareUpdateDocument.document_id, SoftwareUpdateDocument.baseline_number)
                            .where(SoftwareUpdateDocument.id == su_id))).first()
    return f"{row[0]} rev. {row[1]}" if row else None
