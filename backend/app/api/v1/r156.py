"""
R156 SUMS register — tipi vozil, ECU register, RXSWIN-i in njihovi baseline-i.

Pravila zaklepanja (R156 §7.1.2.3):
  - postavke se lahko spreminjajo samo v baseline-u s statusom 'draft'
  - izdaja (release) zaklene baseline; prejšnji izdani postane 'superseded'
  - sprememba izdanega stanja = nov draft baseline (kopija zadnjega izdanega)
Isto pravilo uveljavljajo triggerji v bazi (app/models/r156_locks.py).
Vsako pisanje gre v audit log s stanjem pred in po.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep, require_role
from app.models.r156 import ECU, RXSWIN, RXSWINBaseline, RXSWINBaselineItem, VehicleType
from app.models.user import User
from app.schemas.r156 import (
    SHA256_PATTERN,
    BaselineCreate,
    BaselineItemCreate,
    BaselineItemResponse,
    BaselineItemUpdate,
    BaselineResponse,
    BaselineSummary,
    BaselineUpdate,
    ECUCreate,
    ECUResponse,
    ECUUpdate,
    RXSWINCreate,
    RXSWINDetail,
    RXSWINListItem,
    RXSWINUpdate,
    VehicleTypeCreate,
    VehicleTypeResponse,
    VehicleTypeUpdate,
    VerifyRequest,
    VerifyResponse,
)
from app.utils.audit import write_audit_log

router = APIRouter()

# Izdajo (zaklep) lahko potrdi le odgovorna oseba, ne tehnik
ReleaseDep = Depends(require_role("admin", "qc_manager"))

ITEM_FIELDS = (
    "sw_version",
    "sw_file_name",
    "sw_file_sha256",
    "sw_config_version",
    "sw_config_file_name",
    "sw_config_sha256",
    "egnyte_folder_url",
    "compatible_hardware",
    "change_log",
    "description",
)


async def _audit(db, user: dict, action: str, entity_type: str, entity_id, before=None, after=None):
    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
    )


def _snap(obj, fields) -> dict:
    out = {}
    for f in fields:
        v = getattr(obj, f)
        out[f] = str(v) if isinstance(v, (uuid.UUID, datetime)) else v
    return out


def _item_sha_valid(item: RXSWINBaselineItem) -> bool:
    """Pogoj za izdajo: datoteka SW ima veljavno SHA-256; če je navedena konfiguracija, tudi ta."""
    if not item.sw_file_sha256 or not SHA256_PATTERN.match(item.sw_file_sha256):
        return False
    has_config = bool(item.sw_config_version or item.sw_config_file_name or item.sw_config_sha256)
    if has_config and (not item.sw_config_sha256 or not SHA256_PATTERN.match(item.sw_config_sha256)):
        return False
    return True


# ─── Tipi vozil ───────────────────────────────────────────────────────────────


@router.get("/vehicle-types", response_model=list[VehicleTypeResponse])
async def list_vehicle_types(user: CurrentUserDep, db: DbSession):
    result = await db.execute(
        select(VehicleType).where(VehicleType.organization_id == user["org_id"]).order_by(VehicleType.name)
    )
    return result.scalars().all()


async def _get_vehicle_type(db, type_id: uuid.UUID, org_id) -> VehicleType:
    vt = await db.scalar(select(VehicleType).where(VehicleType.id == type_id, VehicleType.organization_id == org_id))
    if not vt:
        raise HTTPException(status_code=404, detail="Tip vozila ne obstaja")
    return vt


@router.post("/vehicle-types", response_model=VehicleTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_vehicle_type(data: VehicleTypeCreate, db: DbSession, user: dict = ReleaseDep):
    exists = await db.scalar(
        select(VehicleType.id).where(VehicleType.organization_id == user["org_id"], VehicleType.name == data.name)
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"Tip vozila '{data.name}' že obstaja")
    vt = VehicleType(organization_id=user["org_id"], **data.model_dump())
    db.add(vt)
    await db.flush()
    await _audit(db, user, "create", "vehicle_type", vt.id, after=data.model_dump())
    await db.commit()
    await db.refresh(vt)
    return vt


@router.put("/vehicle-types/{type_id}", response_model=VehicleTypeResponse)
async def update_vehicle_type(type_id: uuid.UUID, data: VehicleTypeUpdate, db: DbSession, user: dict = ReleaseDep):
    vt = await _get_vehicle_type(db, type_id, user["org_id"])
    changes = data.model_dump(exclude_unset=True)
    before = _snap(vt, changes.keys())
    for k, v in changes.items():
        setattr(vt, k, v)
    await _audit(db, user, "update", "vehicle_type", vt.id, before=before, after=changes)
    await db.commit()
    await db.refresh(vt)
    return vt


# ─── ECU register ─────────────────────────────────────────────────────────────

ECU_FIELDS = ("ecu_name", "system_name", "supplier", "eversum_part_number", "un_ece_reg_number", "description")


@router.get("/ecus", response_model=list[ECUResponse])
async def list_ecus(user: CurrentUserDep, db: DbSession, vehicle_type_id: uuid.UUID | None = Query(None)):
    q = select(ECU).where(ECU.organization_id == user["org_id"])
    if vehicle_type_id:
        q = q.where(ECU.vehicle_type_id == vehicle_type_id)
    result = await db.execute(q.order_by(ECU.ecu_name))
    return result.scalars().all()


@router.post("/ecus", response_model=ECUResponse, status_code=status.HTTP_201_CREATED)
async def create_ecu(data: ECUCreate, user: NonPartnerDep, db: DbSession):
    await _get_vehicle_type(db, data.vehicle_type_id, user["org_id"])
    exists = await db.scalar(
        select(ECU.id).where(ECU.vehicle_type_id == data.vehicle_type_id, ECU.ecu_name == data.ecu_name)
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"ECU '{data.ecu_name}' za ta tip vozila že obstaja")
    ecu = ECU(organization_id=user["org_id"], **data.model_dump())
    db.add(ecu)
    await db.flush()
    await _audit(db, user, "create", "ecu", ecu.id, after=_snap(ecu, ECU_FIELDS + ("vehicle_type_id",)))
    await db.commit()
    await db.refresh(ecu)
    return ecu


@router.put("/ecus/{ecu_id}", response_model=ECUResponse)
async def update_ecu(ecu_id: uuid.UUID, data: ECUUpdate, user: NonPartnerDep, db: DbSession):
    ecu = await db.scalar(select(ECU).where(ECU.id == ecu_id, ECU.organization_id == user["org_id"]))
    if not ecu:
        raise HTTPException(status_code=404, detail="ECU ne obstaja")
    changes = data.model_dump(exclude_unset=True)
    if "ecu_name" in changes and changes["ecu_name"] != ecu.ecu_name:
        dup = await db.scalar(
            select(ECU.id).where(ECU.vehicle_type_id == ecu.vehicle_type_id, ECU.ecu_name == changes["ecu_name"])
        )
        if dup:
            raise HTTPException(status_code=409, detail=f"ECU '{changes['ecu_name']}' za ta tip vozila že obstaja")
    before = _snap(ecu, changes.keys())
    for k, v in changes.items():
        setattr(ecu, k, v)
    await _audit(db, user, "update", "ecu", ecu.id, before=before, after=changes)
    await db.commit()
    await db.refresh(ecu)
    return ecu


# ─── RXSWIN ───────────────────────────────────────────────────────────────────


def _summary(b: RXSWINBaseline | None) -> BaselineSummary | None:
    if b is None:
        return None
    return BaselineSummary(
        id=b.id,
        baseline_number=b.baseline_number,
        status=b.status,
        released_at=b.released_at,
        item_count=len(b.items),
    )


@router.get("/rxswins", response_model=list[RXSWINListItem])
async def list_rxswins(user: CurrentUserDep, db: DbSession, vehicle_type_id: uuid.UUID | None = Query(None)):
    q = (
        select(RXSWIN)
        .where(RXSWIN.organization_id == user["org_id"])
        .options(
            selectinload(RXSWIN.baselines).selectinload(RXSWINBaseline.items),
            selectinload(RXSWIN.vehicle_type),
        )
        .order_by(RXSWIN.rxswin)
    )
    if vehicle_type_id:
        q = q.where(RXSWIN.vehicle_type_id == vehicle_type_id)
    rxswins = (await db.execute(q)).scalars().all()

    out = []
    for r in rxswins:
        released = [b for b in r.baselines if b.status == "released"]
        drafts = [b for b in r.baselines if b.status == "draft"]
        out.append(
            RXSWINListItem(
                id=r.id,
                vehicle_type_id=r.vehicle_type_id,
                vehicle_type_name=r.vehicle_type.name,
                rxswin=r.rxswin,
                description=r.description,
                regulations_affected=r.regulations_affected or [],
                status=r.status,
                current_baseline=_summary(max(released, key=lambda b: b.baseline_number) if released else None),
                draft_baseline=_summary(drafts[0] if drafts else None),
                baseline_count=len(r.baselines),
                updated_at=r.updated_at,
            )
        )
    return out


async def _load_rxswin(db, rxswin_id: uuid.UUID, org_id) -> RXSWIN:
    r = await db.scalar(
        select(RXSWIN)
        .where(RXSWIN.id == rxswin_id, RXSWIN.organization_id == org_id)
        .options(
            selectinload(RXSWIN.baselines).selectinload(RXSWINBaseline.items).selectinload(RXSWINBaselineItem.ecu),
            selectinload(RXSWIN.vehicle_type),
        )
        .execution_options(populate_existing=True)
    )
    if not r:
        raise HTTPException(status_code=404, detail="RXSWIN ne obstaja")
    return r


def _item_response(item: RXSWINBaselineItem) -> BaselineItemResponse:
    return BaselineItemResponse(
        id=item.id,
        baseline_id=item.baseline_id,
        ecu_id=item.ecu_id,
        ecu_name=item.ecu.ecu_name,
        eversum_part_number=item.ecu.eversum_part_number,
        supplier=item.ecu.supplier,
        sha_valid=_item_sha_valid(item),
        **{f: getattr(item, f) for f in ITEM_FIELDS},
    )


async def _rxswin_detail(db, r: RXSWIN) -> RXSWINDetail:
    user_ids = {uid for b in r.baselines for uid in (b.created_by, b.released_by) if uid}
    names: dict = {}
    if user_ids:
        rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))
        names = dict(rows.all())
    baselines = [
        BaselineResponse(
            id=b.id,
            rxswin_id=b.rxswin_id,
            baseline_number=b.baseline_number,
            status=b.status,
            integrity_method=b.integrity_method,
            notes=b.notes,
            released_at=b.released_at,
            released_by=b.released_by,
            released_by_name=names.get(b.released_by),
            created_by=b.created_by,
            created_by_name=names.get(b.created_by),
            created_at=b.created_at,
            items=[_item_response(i) for i in sorted(b.items, key=lambda i: i.ecu.ecu_name)],
        )
        for b in sorted(r.baselines, key=lambda b: b.baseline_number, reverse=True)
    ]
    return RXSWINDetail(
        id=r.id,
        vehicle_type_id=r.vehicle_type_id,
        vehicle_type_name=r.vehicle_type.name,
        rxswin=r.rxswin,
        description=r.description,
        regulations_affected=r.regulations_affected or [],
        status=r.status,
        created_at=r.created_at,
        updated_at=r.updated_at,
        baselines=baselines,
    )


@router.post("/rxswins", response_model=RXSWINDetail, status_code=status.HTTP_201_CREATED)
async def create_rxswin(data: RXSWINCreate, user: NonPartnerDep, db: DbSession):
    await _get_vehicle_type(db, data.vehicle_type_id, user["org_id"])
    exists = await db.scalar(
        select(RXSWIN.id).where(RXSWIN.organization_id == user["org_id"], RXSWIN.rxswin == data.rxswin)
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"RXSWIN '{data.rxswin}' že obstaja")
    r = RXSWIN(organization_id=user["org_id"], status="active", **data.model_dump())
    db.add(r)
    await db.flush()
    await _audit(
        db,
        user,
        "create",
        "rxswin",
        r.id,
        after={
            "rxswin": r.rxswin,
            "vehicle_type_id": str(r.vehicle_type_id),
            "description": r.description,
            "regulations_affected": r.regulations_affected,
        },
    )
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, r.id, user["org_id"]))


@router.get("/rxswins/{rxswin_id}", response_model=RXSWINDetail)
async def get_rxswin(rxswin_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    return await _rxswin_detail(db, await _load_rxswin(db, rxswin_id, user["org_id"]))


@router.put("/rxswins/{rxswin_id}", response_model=RXSWINDetail)
async def update_rxswin(rxswin_id: uuid.UUID, data: RXSWINUpdate, user: NonPartnerDep, db: DbSession):
    r = await _load_rxswin(db, rxswin_id, user["org_id"])
    changes = data.model_dump(exclude_unset=True)
    before = _snap(r, changes.keys())
    for k, v in changes.items():
        setattr(r, k, v)
    await _audit(db, user, "update", "rxswin", r.id, before=before, after=changes)
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, rxswin_id, user["org_id"]))


# ─── Baseline-i ───────────────────────────────────────────────────────────────


@router.post("/rxswins/{rxswin_id}/baselines", response_model=RXSWINDetail, status_code=status.HTTP_201_CREATED)
async def create_baseline(rxswin_id: uuid.UUID, data: BaselineCreate, user: NonPartnerDep, db: DbSession):
    """Nov draft baseline. Če obstaja izdan baseline, se njegove postavke prekopirajo kot izhodišče."""
    r = await _load_rxswin(db, rxswin_id, user["org_id"])
    if r.status != "active":
        raise HTTPException(status_code=409, detail="RXSWIN je umaknjen — novega baseline-a ni mogoče odpreti")
    if any(b.status == "draft" for b in r.baselines):
        raise HTTPException(status_code=409, detail="Za ta RXSWIN že obstaja odprt osnutek baseline-a")

    number = max((b.baseline_number for b in r.baselines), default=0) + 1
    baseline = RXSWINBaseline(
        organization_id=user["org_id"],
        rxswin_id=r.id,
        baseline_number=number,
        status="draft",
        integrity_method="SHA-256",
        notes=data.notes,
        created_by=user["user_id"],
    )
    db.add(baseline)
    await db.flush()

    released = [b for b in r.baselines if b.status == "released"]
    source = max(released, key=lambda b: b.baseline_number) if released else None
    if source:
        for item in source.items:
            db.add(
                RXSWINBaselineItem(
                    baseline_id=baseline.id,
                    ecu_id=item.ecu_id,
                    **{f: getattr(item, f) for f in ITEM_FIELDS},
                )
            )
        await db.flush()

    await _audit(
        db,
        user,
        "create",
        "rxswin_baseline",
        baseline.id,
        after={
            "rxswin": r.rxswin,
            "baseline_number": number,
            "status": "draft",
            "copied_from_baseline": source.baseline_number if source else None,
            "notes": data.notes,
        },
    )
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, rxswin_id, user["org_id"]))


async def _get_baseline(db, baseline_id: uuid.UUID, org_id, *, draft_only: bool) -> RXSWINBaseline:
    b = await db.scalar(
        select(RXSWINBaseline)
        .where(RXSWINBaseline.id == baseline_id, RXSWINBaseline.organization_id == org_id)
        .options(
            selectinload(RXSWINBaseline.items).selectinload(RXSWINBaselineItem.ecu),
            selectinload(RXSWINBaseline.rxswin_ref),
        )
        .with_for_update(of=RXSWINBaseline)
    )
    if not b:
        raise HTTPException(status_code=404, detail="Baseline ne obstaja")
    if draft_only and b.status != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"Baseline {b.baseline_number} je {b.status} in samo za branje — odpri nov baseline",
        )
    return b


@router.put("/rxswin-baselines/{baseline_id}", response_model=RXSWINDetail)
async def update_baseline(baseline_id: uuid.UUID, data: BaselineUpdate, user: NonPartnerDep, db: DbSession):
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    before = {"notes": b.notes}
    b.notes = data.notes
    await _audit(db, user, "update", "rxswin_baseline", b.id, before=before, after={"notes": data.notes})
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, b.rxswin_id, user["org_id"]))


@router.delete("/rxswin-baselines/{baseline_id}", response_model=RXSWINDetail)
async def discard_draft_baseline(baseline_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    """Zavrže neizdan osnutek. Izdanih baseline-ov ni mogoče brisati."""
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    rxswin_id = b.rxswin_id
    await _audit(
        db,
        user,
        "delete",
        "rxswin_baseline",
        b.id,
        before={
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "status": b.status,
            "items": [{"ecu": i.ecu.ecu_name, **_snap(i, ITEM_FIELDS)} for i in b.items],
        },
    )
    await db.delete(b)
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, rxswin_id, user["org_id"]))


@router.post("/rxswin-baselines/{baseline_id}/items", response_model=RXSWINDetail, status_code=status.HTTP_201_CREATED)
async def add_baseline_item(baseline_id: uuid.UUID, data: BaselineItemCreate, user: NonPartnerDep, db: DbSession):
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    ecu = await db.scalar(select(ECU).where(ECU.id == data.ecu_id, ECU.organization_id == user["org_id"]))
    if not ecu:
        raise HTTPException(status_code=404, detail="ECU ne obstaja")
    if ecu.vehicle_type_id != b.rxswin_ref.vehicle_type_id:
        raise HTTPException(status_code=422, detail="ECU ne pripada tipu vozila tega RXSWIN-a")
    if any(i.ecu_id == ecu.id for i in b.items):
        raise HTTPException(status_code=409, detail=f"ECU '{ecu.ecu_name}' je v tem baseline-u že naveden")

    item = RXSWINBaselineItem(baseline_id=b.id, **data.model_dump())
    db.add(item)
    await db.flush()
    await _audit(
        db,
        user,
        "create",
        "rxswin_baseline_item",
        item.id,
        after={
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "ecu": ecu.ecu_name,
            **_snap(item, ITEM_FIELDS),
        },
    )
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, b.rxswin_id, user["org_id"]))


def _find_item(b: RXSWINBaseline, item_id: uuid.UUID) -> RXSWINBaselineItem:
    item = next((i for i in b.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Postavka ne obstaja")
    return item


@router.put("/rxswin-baselines/{baseline_id}/items/{item_id}", response_model=RXSWINDetail)
async def update_baseline_item(
    baseline_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BaselineItemUpdate,
    user: NonPartnerDep,
    db: DbSession,
):
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    item = _find_item(b, item_id)
    changes = data.model_dump(exclude_unset=True)
    if "sw_version" in changes and not changes["sw_version"]:
        raise HTTPException(status_code=422, detail="Verzija programske opreme je obvezna")
    before = _snap(item, changes.keys())
    for k, v in changes.items():
        setattr(item, k, v)
    await _audit(
        db,
        user,
        "update",
        "rxswin_baseline_item",
        item.id,
        before=before,
        after={
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "ecu": item.ecu.ecu_name,
            **changes,
        },
    )
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, b.rxswin_id, user["org_id"]))


@router.delete("/rxswin-baselines/{baseline_id}/items/{item_id}", response_model=RXSWINDetail)
async def delete_baseline_item(baseline_id: uuid.UUID, item_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    item = _find_item(b, item_id)
    await _audit(
        db,
        user,
        "delete",
        "rxswin_baseline_item",
        item.id,
        before={
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "ecu": item.ecu.ecu_name,
            **_snap(item, ITEM_FIELDS),
        },
    )
    await db.delete(item)
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, b.rxswin_id, user["org_id"]))


@router.post("/rxswin-baselines/{baseline_id}/release", response_model=RXSWINDetail)
async def release_baseline(baseline_id: uuid.UUID, db: DbSession, user: dict = ReleaseDep):
    """
    Izda baseline: postane samo za branje, prejšnji izdani postane 'superseded'.
    Pogoj: vsaj ena postavka in veljavne SHA-256 za vse datoteke.
    """
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    if not b.items:
        raise HTTPException(status_code=422, detail="Baseline brez postavk ni mogoče izdati")
    invalid = sorted(i.ecu.ecu_name for i in b.items if not _item_sha_valid(i))
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Manjka ali ni veljavna SHA-256 za: {', '.join(invalid)}",
        )

    previous = (
        (
            await db.execute(
                select(RXSWINBaseline)
                .where(RXSWINBaseline.rxswin_id == b.rxswin_id, RXSWINBaseline.status == "released")
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for p in previous:
        p.status = "superseded"
        await _audit(
            db,
            user,
            "supersede",
            "rxswin_baseline",
            p.id,
            before={"status": "released"},
            after={"status": "superseded", "superseded_by_baseline": b.baseline_number},
        )

    b.status = "released"
    b.released_at = datetime.now(timezone.utc)
    b.released_by = user["user_id"]
    await _audit(
        db,
        user,
        "release",
        "rxswin_baseline",
        b.id,
        before={"status": "draft"},
        after={
            "status": "released",
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "items": [{"ecu": i.ecu.ecu_name, **_snap(i, ITEM_FIELDS)} for i in b.items],
        },
    )
    await db.commit()
    return await _rxswin_detail(db, await _load_rxswin(db, b.rxswin_id, user["org_id"]))


# ─── Preverjanje SHA-256 (R156 §7.1.3.1 — integriteta pred reflashem) ─────────


@router.post("/rxswin-baselines/{baseline_id}/items/{item_id}/verify", response_model=VerifyResponse)
async def verify_item_checksum(
    baseline_id: uuid.UUID,
    item_id: uuid.UUID,
    data: VerifyRequest,
    user: NonPartnerDep,
    db: DbSession,
):
    """
    Primerja SHA-256, ki jo je brskalnik izračunal iz datoteke, s shranjeno vrednostjo,
    in zapiše preverjanje v audit log. Datoteka sama ne zapusti tehnikovega računalnika.
    """
    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=False)
    item = _find_item(b, item_id)
    expected = item.sw_file_sha256 if data.target == "sw" else item.sw_config_sha256
    match = expected is not None and expected == data.computed_sha256
    await _audit(
        db,
        user,
        "verify",
        "rxswin_baseline_item",
        item.id,
        after={
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "ecu": item.ecu.ecu_name,
            "target": data.target,
            "file_name": data.file_name,
            "file_size": data.file_size,
            "expected_sha256": expected,
            "computed_sha256": data.computed_sha256,
            "match": match,
        },
    )
    await db.commit()
    return VerifyResponse(match=match, expected_sha256=expected, computed_sha256=data.computed_sha256, recorded=True)


# ─── Readme za Egnyte (enaka zgradba kot readme iz Helix ALM) ─────────────────


@router.get("/rxswin-baselines/{baseline_id}/items/{item_id}/readme.pdf")
async def item_readme_pdf(baseline_id: uuid.UUID, item_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    from urllib.parse import quote

    from fastapi.responses import Response

    from app.services.r156_reports import ecu_short_name, render_readme_pdf

    rxswin_id = await db.scalar(
        select(RXSWINBaseline.rxswin_id).where(
            RXSWINBaseline.id == baseline_id, RXSWINBaseline.organization_id == user["org_id"]
        )
    )
    if not rxswin_id:
        raise HTTPException(status_code=404, detail="Baseline ne obstaja")
    detail = await _rxswin_detail(db, await _load_rxswin(db, rxswin_id, user["org_id"]))
    baseline = next(b for b in detail.baselines if b.id == baseline_id)
    item = next((i for i in baseline.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Postavka ne obstaja")
    from starlette.concurrency import run_in_threadpool

    pdf = await run_in_threadpool(render_readme_pdf, detail, baseline, item)
    filename = f"{ecu_short_name(item.ecu_name)} {item.sw_version} - Readme.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


# ─── Izvozi za organ / tehnično službo (R156 §7.1.1.12) ───────────────────────


@router.get("/rxswin-register.pdf")
async def rxswin_register_pdf(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_type_id: uuid.UUID | None = Query(None),
):
    """Celoten register RXSWIN z vsemi (tudi nadomeščenimi) baseline-i in povezanimi SU dokumenti."""
    from fastapi.responses import Response

    from app.models.r156 import SoftwareUpdateDocument, SoftwareUpdateRXSWIN
    from app.services.r156_reports import render_register_pdf

    q = select(RXSWIN.id).where(RXSWIN.organization_id == user["org_id"]).order_by(RXSWIN.rxswin)
    vt_name = None
    if vehicle_type_id:
        vt = await _get_vehicle_type(db, vehicle_type_id, user["org_id"])
        vt_name = vt.name
        q = q.where(RXSWIN.vehicle_type_id == vehicle_type_id)
    ids = (await db.execute(q)).scalars().all()
    details = [await _rxswin_detail(db, await _load_rxswin(db, i, user["org_id"])) for i in ids]

    numbers = (
        dict(
            (
                await db.execute(
                    select(RXSWINBaseline.id, RXSWINBaseline.baseline_number).where(RXSWINBaseline.rxswin_id.in_(ids))
                )
            ).all()
        )
        if ids
        else {}
    )
    rows = (
        (
            await db.execute(
                select(SoftwareUpdateRXSWIN, SoftwareUpdateDocument)
                .join(SoftwareUpdateDocument, SoftwareUpdateDocument.id == SoftwareUpdateRXSWIN.software_update_id)
                .where(SoftwareUpdateRXSWIN.rxswin_id.in_(ids), SoftwareUpdateDocument.status != "draft")
                .order_by(SoftwareUpdateDocument.document_id, SoftwareUpdateDocument.baseline_number)
            )
        ).all()
        if ids
        else []
    )
    updates: dict[str, list] = {}
    for link, doc in rows:
        updates.setdefault(str(link.rxswin_id), []).append(
            {
                "document_id": doc.document_id,
                "revision": doc.baseline_number,
                "title": doc.title,
                "status": doc.status,
                "released_at": doc.released_at,
                "before": numbers.get(link.baseline_before_id),
                "after": numbers.get(link.baseline_after_id),
            }
        )

    from starlette.concurrency import run_in_threadpool

    pdf = await run_in_threadpool(render_register_pdf, details, updates, vt_name)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="RXSWIN-register.pdf"'},
    )


@router.get("/vehicle-configurations.csv")
async def vehicle_configurations_csv(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_type_id: uuid.UUID | None = Query(None),
):
    """Zadnja znana konfiguracija vseh vozil — ena vrstica na VIN × ECU (R156 §7.1.2.2, §7.1.2.4)."""
    import csv
    import io

    from fastapi.responses import Response

    from app.models.vehicle import Vehicle
    from app.services.vehicle_config import current_configuration
    from app.utils.audit import csv_safe

    q = select(Vehicle).where(Vehicle.organization_id == user["org_id"]).order_by(Vehicle.vin)
    if vehicle_type_id:
        q = q.where(Vehicle.vehicle_type_id == vehicle_type_id)
    vehicles = (await db.execute(q)).scalars().all()
    types = dict(
        (
            await db.execute(
                select(VehicleType.id, VehicleType.name).where(VehicleType.organization_id == user["org_id"])
            )
        ).all()
    )

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(
        [
            "vin",
            "vehicle",
            "vehicle_type",
            "config_id",
            "config_type",
            "recorded_utc",
            "reason",
            "rxswin",
            "baseline",
            "ecu",
            "part_number",
            "sw_version",
            "sw_file_sha256",
            "config_version",
            "config_sha256",
            "serial_number",
            "hw_version",
        ]
    )
    for v in vehicles:
        cfg = await current_configuration(db, v.id)
        base = [v.vin, v.name, types.get(v.vehicle_type_id, "")]
        if not cfg:
            w.writerow([csv_safe(x) for x in base + ["", "", "", "no configuration recorded"] + [""] * 10])
            continue
        hw = {e["ecu_id"]: e for e in cfg.snapshot.get("ecus", [])}
        meta = [cfg.config_id, cfg.config_type, cfg.created_at.isoformat(), cfg.reason or ""]
        for r in cfg.snapshot.get("rxswins", []):
            for i in r["items"]:
                e = hw.get(i["ecu_id"], {})
                w.writerow(
                    [
                        csv_safe(x)
                        for x in base
                        + meta
                        + [
                            r["rxswin"],
                            r["baseline_number"],
                            i["ecu"],
                            i["part_number"],
                            i["sw_version"],
                            i.get("sw_file_sha256") or "",
                            i.get("sw_config_version") or "",
                            i.get("sw_config_sha256") or "",
                            e.get("serial_number") or "",
                            e.get("hardware_version") or "",
                        ]
                    ]
                )
    return Response(
        content=out.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="vehicle-configurations.csv"'},
    )


# ─── Pregled (začetna stran) ──────────────────────────────────────────────────


@router.get("/sums-overview")
async def sums_overview(user: CurrentUserDep, db: DbSession):
    """Kaj čaka na koga: osnutki, neizvedene posodobitve, vozila brez EOL konfiguracije."""
    from app.models.audit_log import AuditLog
    from app.models.r156 import SoftwareUpdateDocument, SoftwareUpdateTarget, VehicleConfiguration
    from app.models.vehicle import Vehicle

    org = user["org_id"]
    draft_baselines = (
        await db.execute(
            select(RXSWIN.id, RXSWIN.rxswin, RXSWINBaseline.baseline_number, RXSWINBaseline.created_at)
            .join(RXSWINBaseline, RXSWINBaseline.rxswin_id == RXSWIN.id)
            .where(RXSWIN.organization_id == org, RXSWINBaseline.status == "draft")
            .order_by(RXSWINBaseline.created_at)
        )
    ).all()
    su_drafts = (
        await db.execute(
            select(
                SoftwareUpdateDocument.id,
                SoftwareUpdateDocument.document_id,
                SoftwareUpdateDocument.baseline_number,
                SoftwareUpdateDocument.title,
                SoftwareUpdateDocument.updated_at,
            )
            .where(SoftwareUpdateDocument.organization_id == org, SoftwareUpdateDocument.status == "draft")
            .order_by(SoftwareUpdateDocument.updated_at.desc())
        )
    ).all()
    pending = (
        await db.execute(
            select(
                SoftwareUpdateDocument.id,
                SoftwareUpdateDocument.document_id,
                SoftwareUpdateDocument.baseline_number,
                SoftwareUpdateDocument.title,
                func.count(SoftwareUpdateTarget.id),
            )
            .join(SoftwareUpdateTarget, SoftwareUpdateTarget.software_update_id == SoftwareUpdateDocument.id)
            .where(
                SoftwareUpdateDocument.organization_id == org,
                SoftwareUpdateDocument.status == "released",
                SoftwareUpdateTarget.result.is_(None),
            )
            .group_by(SoftwareUpdateDocument.id)
            .order_by(SoftwareUpdateDocument.document_id)
        )
    ).all()
    with_config = select(VehicleConfiguration.vehicle_id).where(VehicleConfiguration.config_type == "initial_eol")
    no_eol = (
        await db.execute(
            select(Vehicle.id, Vehicle.vin, Vehicle.name)
            .where(Vehicle.organization_id == org, Vehicle.vehicle_type_id.is_not(None), Vehicle.id.not_in(with_config))
            .order_by(Vehicle.vin)
        )
    ).all()
    counts = {
        "rxswins": await db.scalar(select(func.count()).select_from(RXSWIN).where(RXSWIN.organization_id == org)),
        "released_baselines": await db.scalar(
            select(func.count())
            .select_from(RXSWINBaseline)
            .where(RXSWINBaseline.organization_id == org, RXSWINBaseline.status == "released")
        ),
        "released_updates": await db.scalar(
            select(func.count())
            .select_from(SoftwareUpdateDocument)
            .where(SoftwareUpdateDocument.organization_id == org, SoftwareUpdateDocument.status == "released")
        ),
        "vehicles": await db.scalar(
            select(func.count())
            .select_from(Vehicle)
            .where(Vehicle.organization_id == org, Vehicle.vehicle_type_id.is_not(None))
        ),
    }
    recent = (
        await db.execute(
            select(AuditLog.created_at, AuditLog.action, AuditLog.entity_type, AuditLog.after, User.full_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.org_id == org, AuditLog.action.not_in(["login", "logout"]))
            .order_by(AuditLog.created_at.desc())
            .limit(12)
        )
    ).all()

    def label(after: dict | None) -> str:
        if not after:
            return ""
        if "document_id" in after:
            return (
                f"{after['document_id']} rev. {after['revision']}" if "revision" in after else str(after["document_id"])
            )
        if "rxswin" in after and "baseline_number" in after:
            return f"{after['rxswin']} B{after['baseline_number']}"
        for k in ("vin", "rxswin", "ecu_name", "email"):
            if k in after:
                return str(after[k])
        return ""

    return {
        "counts": counts,
        "draft_baselines": [
            {"rxswin_id": str(i), "rxswin": r, "baseline_number": n, "created_at": c} for i, r, n, c in draft_baselines
        ],
        "su_drafts": [
            {"id": str(i), "document_id": d, "revision": n, "title": t, "updated_at": u} for i, d, n, t, u in su_drafts
        ],
        "pending_execution": [
            {"id": str(i), "document_id": d, "revision": n, "title": t, "pending": c} for i, d, n, t, c in pending
        ],
        "vehicles_without_eol": [{"id": str(i), "vin": v, "name": n} for i, v, n in no_eol],
        "recent": [
            {"at": a, "action": ac, "entity_type": et, "label": label(af), "user": un} for a, ac, et, af, un in recent
        ],
    }


# ─── Uvoz iz CSV (selitev iz ERP / Helix) ─────────────────────────────────────
# Odjemalec prebere CSV v brskalniku in pošlje vrstice. Najprej dry_run (predogled),
# nato uvoz. Uvoz steče samo, če so vse vrstice veljavne (vse ali nič).


class VehicleImportRow(BaseModel):
    vin: str
    name: str | None = None
    year: int | None = None


class VehicleImportRequest(BaseModel):
    vehicle_type_id: uuid.UUID
    rows: list[VehicleImportRow] = Field(min_length=1, max_length=5000)
    dry_run: bool = True


class ItemImportRow(BaseModel):
    ecu: str  # ime ECU ali eVersum številka dela
    sw_version: str
    sw_file_name: str | None = None
    sw_file_sha256: str | None = None
    sw_config_version: str | None = None
    sw_config_file_name: str | None = None
    sw_config_sha256: str | None = None
    compatible_hardware: str | None = None
    egnyte_folder_url: str | None = None
    change_log: str | None = None
    description: str | None = None


class ItemImportRequest(BaseModel):
    rows: list[ItemImportRow] = Field(min_length=1, max_length=500)
    dry_run: bool = True


VIN_RE = __import__("re").compile(r"^[A-HJ-NPR-Z0-9]{11,17}$")


@router.post("/vehicle-import")
async def import_vehicles(data: VehicleImportRequest, user: NonPartnerDep, db: DbSession):
    from datetime import date as _date

    from app.models.vehicle import Vehicle
    from app.models.vehicle_twin import VehicleTwin

    vt = await _get_vehicle_type(db, data.vehicle_type_id, user["org_id"])
    vins = [r.vin.strip().upper() for r in data.rows]
    existing = set((await db.execute(select(Vehicle.vin).where(Vehicle.vin.in_(vins)))).scalars())
    errors, new, skipped, seen = [], [], [], set()
    for i, (r, vin) in enumerate(zip(data.rows, vins), start=1):
        if vin in seen:
            errors.append({"row": i, "vin": vin, "error": "VIN se v datoteki ponovi"})
        elif vin in existing:
            skipped.append(vin)  # že v registru — ne glede na obliko
        elif not VIN_RE.match(vin):
            errors.append({"row": i, "vin": vin, "error": "VIN: 11–17 znakov, velike črke in številke (brez I, O, Q)"})
        elif r.year is not None and not (1990 <= r.year <= _date.today().year + 1):
            errors.append({"row": i, "vin": vin, "error": "Neveljaven letnik"})
        else:
            new.append((vin, r))
        seen.add(vin)

    result = {"to_create": [v for v, _ in new], "skipped_existing": skipped, "errors": errors, "created": 0}
    if data.dry_run or errors:
        return result
    for vin, r in new:
        v = Vehicle(
            organization_id=user["org_id"],
            vehicle_type_id=vt.id,
            vin=vin,
            name=(r.name or vin[-6:]).strip(),
            model=vt.name,
            year=r.year or _date.today().year,
        )
        db.add(v)
        await db.flush()
        db.add(VehicleTwin(vehicle_id=v.id))
    await _audit(
        db,
        user,
        "import",
        "vehicle",
        vt.id,
        after={
            "vehicle_type": vt.name,
            "created": [v for v, _ in new],
            "skipped_existing": skipped,
        },
    )
    await db.commit()
    result["created"] = len(new)
    return result


@router.post("/rxswin-baselines/{baseline_id}/items/import")
async def import_baseline_items(baseline_id: uuid.UUID, data: ItemImportRequest, user: NonPartnerDep, db: DbSession):
    from pydantic import ValidationError

    b = await _get_baseline(db, baseline_id, user["org_id"], draft_only=True)
    ecus = (await db.execute(select(ECU).where(ECU.vehicle_type_id == b.rxswin_ref.vehicle_type_id))).scalars().all()
    by_key = {}
    for e in ecus:
        by_key.setdefault(e.ecu_name.strip().lower(), []).append(e)
        by_key.setdefault(e.eversum_part_number.strip().lower(), []).append(e)
    current = {i.ecu_id: i for i in b.items}

    errors, plan, seen = [], [], set()
    for n, r in enumerate(data.rows, start=1):
        matches = by_key.get(r.ecu.strip().lower(), [])
        if len({m.id for m in matches}) != 1:
            errors.append(
                {
                    "row": n,
                    "ecu": r.ecu,
                    "error": "ECU ni v registru" if not matches else "Številka dela ni enolična — uporabi ime ECU",
                }
            )
            continue
        ecu = matches[0]
        if ecu.id in seen:
            errors.append({"row": n, "ecu": r.ecu, "error": "ECU se v datoteki ponovi"})
            continue
        seen.add(ecu.id)
        try:
            fields = BaselineItemCreate(ecu_id=ecu.id, **r.model_dump(exclude={"ecu"}))
        except ValidationError as ex:
            errors.append(
                {
                    "row": n,
                    "ecu": r.ecu,
                    "error": "; ".join(
                        f"{e['loc'][-1]}: {e['msg'].removeprefix('Value error, ')}" for e in ex.errors()
                    ),
                }
            )
            continue
        plan.append((ecu, fields, "update" if ecu.id in current else "create"))

    result = {
        "plan": [{"ecu": e.ecu_name, "action": a, "sw_version": f.sw_version} for e, f, a in plan],
        "errors": errors,
        "applied": 0,
    }
    if data.dry_run or errors:
        return result
    for ecu, fields, action in plan:
        values = fields.model_dump(exclude={"ecu_id"})
        if action == "update":
            item = current[ecu.id]
            for k, v in values.items():
                setattr(item, k, v)
        else:
            db.add(RXSWINBaselineItem(baseline_id=b.id, ecu_id=ecu.id, **values))
    await db.flush()
    await _audit(
        db,
        user,
        "import",
        "rxswin_baseline",
        b.id,
        after={
            "rxswin": b.rxswin_ref.rxswin,
            "baseline_number": b.baseline_number,
            "items": [
                {"ecu": e.ecu_name, "action": a, "sw_version": f.sw_version, "sw_file_sha256": f.sw_file_sha256}
                for e, f, a in plan
            ],
        },
    )
    await db.commit()
    result["applied"] = len(plan)
    return result
