"""
Software Update dokument (R156 §7.1.2.5) — vezan na tip vozila.

Življenjski cikel kot pri RXSWIN baseline-ih:
  draft → released (zaklenjen) → superseded (ko se izda naslednja revizija)
Sprememba izdanega dokumenta = nova revizija (POST /{id}/revise).

Po izdaji sta dovoljena le:
  - zapis izvedbe na ciljnem vozilu (rezultat, kdaj, kdo)
  - zapis obvestila uporabniku (§7.1.1.11)
Isto pravilo uveljavljajo triggerji v bazi (app/models/r156_locks.py).
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep, require_role
from app.models.r156 import (
    RXSWIN,
    RXSWINBaseline,
    SoftwareUpdateDocument,
    SoftwareUpdateRXSWIN,
    SoftwareUpdateTarget,
    VehicleType,
)
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.su_document import (
    EDITABLE_FIELDS,
    AffectedRxswinCreate,
    AffectedRxswinResponse,
    SUDocumentCreate,
    SUDocumentDetail,
    SUDocumentListItem,
    SUDocumentUpdate,
    TargetCompatibility,
    TargetResponse,
    TargetResult,
    TargetsAdd,
    UserNotification,
    VVSignRequest,
)
from app.services.vehicle_config import current_configuration, installed_baselines, record_configuration
from app.utils.audit import write_audit_log

router = APIRouter()

ReleaseDep = Depends(require_role("admin", "qc_manager"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jsonable(v):
    if isinstance(v, (uuid.UUID, datetime)):
        return str(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


async def _audit(db, user: dict, action: str, entity_type: str, entity_id, before=None, after=None):
    await write_audit_log(
        db=db, org_id=user["org_id"], actor_id=user["user_id"], actor_type="user", actor_device="web",
        action=action, entity_type=entity_type, entity_id=entity_id, before=before, after=after,
    )


async def _load(db, doc_id: uuid.UUID, org_id, *, lock: bool = False) -> SoftwareUpdateDocument:
    q = (
        select(SoftwareUpdateDocument)
        .where(SoftwareUpdateDocument.id == doc_id, SoftwareUpdateDocument.organization_id == org_id)
        .options(
            selectinload(SoftwareUpdateDocument.affected_rxswins).selectinload(SoftwareUpdateRXSWIN.rxswin_ref),
            selectinload(SoftwareUpdateDocument.targets),
        )
        .execution_options(populate_existing=True)
    )
    if lock:
        q = q.with_for_update(of=SoftwareUpdateDocument)
    doc = await db.scalar(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Software Update dokument ne obstaja")
    return doc


def _require_draft(doc: SoftwareUpdateDocument) -> None:
    if doc.status != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"{doc.document_id} rev. {doc.baseline_number} je {doc.status} in samo za branje — odpri novo revizijo",
        )


async def _release_blockers(db, doc: SoftwareUpdateDocument) -> list[str]:
    """Kode manjkajočih pogojev za izdajo (frontend jih prevede). Prazno = pripravljen."""
    b: list[str] = []
    if not (doc.description_purpose or "").strip():
        b.append("purpose")
    if not doc.affected_rxswins:
        b.append("no_rxswins")
    else:
        after_ids = [a.baseline_after_id for a in doc.affected_rxswins if a.baseline_after_id]
        statuses = {}
        if after_ids:
            rows = await db.execute(select(RXSWINBaseline.id, RXSWINBaseline.status).where(RXSWINBaseline.id.in_(after_ids)))
            statuses = dict(rows.all())
        for a in doc.affected_rxswins:
            if statuses.get(a.baseline_after_id) != "released":
                b.append(f"baseline_not_released:{a.rxswin_ref.rxswin}")
    if doc.vv_status != "pass" or not doc.vv_signed_by:
        b.append("vv_not_passed")
    if doc.type_approval_update_necessary is None:
        b.append("ta_decision")
    elif not (doc.type_approval_justification or "").strip():
        b.append("ta_justification")
    elif doc.type_approval_update_necessary and not (
        doc.type_approval_granted and doc.type_approval_number and doc.type_approval_date
    ):
        b.append("ta_not_granted")
    if not (doc.execution_conditions or "").strip():
        b.append("execution_conditions")
    if not (doc.safe_state_conditions or "").strip():
        b.append("safe_state_conditions")
    if not (doc.user_actions_required or "").strip():
        b.append("user_actions")
    if not (doc.safety_security_confirmation or "").strip():
        b.append("safety_confirmation")
    if not doc.targets:
        b.append("no_targets")
    elif not all(t.compatibility_confirmed for t in doc.targets):
        b.append("targets_not_confirmed")
    return b


async def _detail(db, doc: SoftwareUpdateDocument) -> SUDocumentDetail:
    vt = await db.get(VehicleType, doc.vehicle_type_id)
    vehicles = {}
    if doc.targets:
        rows = await db.execute(select(Vehicle).where(Vehicle.id.in_([t.vehicle_id for t in doc.targets])))
        vehicles = {v.id: v for v in rows.scalars()}
    baseline_ids = {x for a in doc.affected_rxswins for x in (a.baseline_before_id, a.baseline_after_id) if x}
    baselines = {}
    if baseline_ids:
        rows = await db.execute(select(RXSWINBaseline).where(RXSWINBaseline.id.in_(baseline_ids)))
        baselines = {bl.id: bl for bl in rows.scalars()}
    user_ids = {doc.vv_signed_by, doc.user_notified_by, doc.released_by, doc.created_by}
    user_ids |= {t.confirmed_by for t in doc.targets} | {t.applied_by for t in doc.targets}
    user_ids.discard(None)
    names = {}
    if user_ids:
        names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))).all())
    revisions = (await db.execute(
        select(SoftwareUpdateDocument.id, SoftwareUpdateDocument.baseline_number, SoftwareUpdateDocument.status)
        .where(SoftwareUpdateDocument.organization_id == doc.organization_id,
               SoftwareUpdateDocument.document_id == doc.document_id)
        .order_by(SoftwareUpdateDocument.baseline_number.desc())
    )).all()
    superseded_by = await db.scalar(
        select(SoftwareUpdateDocument.id).where(SoftwareUpdateDocument.supersedes_id == doc.id)
    )

    def bl(i, attr):
        return getattr(baselines[i], attr) if i in baselines else None

    # §7.1.1.7: primerjava zadnje znane konfiguracije vsakega vozila s pričakovanim stanjem "pred"
    preconditions: dict = {}
    for t in doc.targets:
        cfg = await current_configuration(db, t.vehicle_id)
        if not cfg:
            preconditions[t.id] = (None, "unknown", [])
            continue
        installed = {r["rxswin_id"]: r for r in cfg.snapshot.get("rxswins", [])}
        states, detail = [], []
        for a in doc.affected_rxswins:
            cur = installed.get(str(a.rxswin_id))
            cur_label = f"B{cur['baseline_number']}" if cur else "—"
            exp_label = f"B{bl(a.baseline_before_id, 'baseline_number')}" if a.baseline_before_id else "—"
            if cur and cur["baseline_id"] == str(a.baseline_after_id):
                states.append("already_installed")
            elif (cur["baseline_id"] if cur else None) == (str(a.baseline_before_id) if a.baseline_before_id else None):
                states.append("ok")
            else:
                states.append("mismatch")
            detail.append(f"{a.rxswin_ref.rxswin}: {cur_label} / {exp_label}")
        state = ("mismatch" if "mismatch" in states else "already_installed" if states and all(
            s == "already_installed" for s in states) else "ok") if states else "unknown"
        preconditions[t.id] = (cfg.config_id, state, detail)

    return SUDocumentDetail(
        id=doc.id, document_id=doc.document_id, revision=doc.baseline_number,
        vehicle_type_id=doc.vehicle_type_id, vehicle_type_name=vt.name if vt else "—", status=doc.status,
        title=doc.title, description_purpose=doc.description_purpose,
        dependencies_identified=doc.dependencies_identified, system_schemes_baseline=doc.system_schemes_baseline,
        vv_status=doc.vv_status, vv_method=doc.vv_method,
        vv_signed_by_name=names.get(doc.vv_signed_by), vv_signed_at=doc.vv_signed_at,
        type_approval_update_necessary=doc.type_approval_update_necessary,
        type_approval_justification=doc.type_approval_justification,
        unece_affected_requirements=doc.unece_affected_requirements or [],
        type_approval_granted=doc.type_approval_granted, type_approval_number=doc.type_approval_number,
        type_approval_date=doc.type_approval_date,
        user_notification_required=doc.user_notification_required,
        user_notification_method=doc.user_notification_method, user_notified_at=doc.user_notified_at,
        user_notified_by_name=names.get(doc.user_notified_by),
        execution_conditions=doc.execution_conditions, safe_state_conditions=doc.safe_state_conditions,
        user_actions_required=doc.user_actions_required,
        new_hardware_required=doc.new_hardware_required,
        safety_security_confirmation=doc.safety_security_confirmation,
        erp_work_order=doc.erp_work_order, erp_work_order_url=doc.erp_work_order_url,
        egnyte_folder_url=doc.egnyte_folder_url,
        released_at=doc.released_at, released_by_name=names.get(doc.released_by),
        supersedes_id=doc.supersedes_id, superseded_by_id=superseded_by,
        created_by_name=names.get(doc.created_by), created_at=doc.created_at, updated_at=doc.updated_at,
        affected_rxswins=[
            AffectedRxswinResponse(
                id=a.id, rxswin_id=a.rxswin_id, rxswin=a.rxswin_ref.rxswin,
                baseline_before_id=a.baseline_before_id, baseline_before_number=bl(a.baseline_before_id, "baseline_number"),
                baseline_after_id=a.baseline_after_id, baseline_after_number=bl(a.baseline_after_id, "baseline_number"),
                baseline_after_status=bl(a.baseline_after_id, "status"),
            )
            for a in sorted(doc.affected_rxswins, key=lambda a: a.rxswin_ref.rxswin)
        ],
        targets=[
            TargetResponse(
                id=t.id, vehicle_id=t.vehicle_id,
                vin=vehicles[t.vehicle_id].vin if t.vehicle_id in vehicles else "—",
                vehicle_name=vehicles[t.vehicle_id].name if t.vehicle_id in vehicles else "—",
                compatibility_confirmed=t.compatibility_confirmed, compatibility_notes=t.compatibility_notes,
                confirmed_by_name=names.get(t.confirmed_by), confirmed_at=t.confirmed_at,
                result=t.result, applied_at=t.applied_at, applied_by_name=names.get(t.applied_by),
                current_config_id=preconditions[t.id][0], precondition=preconditions[t.id][1],
                precondition_detail=preconditions[t.id][2],
            )
            for t in sorted(doc.targets, key=lambda t: vehicles[t.vehicle_id].vin if t.vehicle_id in vehicles else "")
        ],
        release_blockers=await _release_blockers(db, doc) if doc.status == "draft" else [],
        revisions=[{"id": str(i), "revision": n, "status": s} for i, n, s in revisions],
    )


async def _reload(db, doc_id, org_id) -> SUDocumentDetail:
    return await _detail(db, await _load(db, doc_id, org_id))


# ─── Seznam in ustvarjanje ────────────────────────────────────────────────────

@router.get("", response_model=list[SUDocumentListItem])
async def list_documents(
    user: CurrentUserDep, db: DbSession,
    vehicle_type_id: uuid.UUID | None = Query(None),
    include_superseded: bool = Query(False),
):
    q = (
        select(SoftwareUpdateDocument)
        .where(SoftwareUpdateDocument.organization_id == user["org_id"])
        .options(
            selectinload(SoftwareUpdateDocument.affected_rxswins).selectinload(SoftwareUpdateRXSWIN.rxswin_ref),
            selectinload(SoftwareUpdateDocument.targets),
        )
        .order_by(SoftwareUpdateDocument.document_id.desc(), SoftwareUpdateDocument.baseline_number.desc())
    )
    if vehicle_type_id:
        q = q.where(SoftwareUpdateDocument.vehicle_type_id == vehicle_type_id)
    if not include_superseded:
        q = q.where(SoftwareUpdateDocument.status != "superseded")
    docs = (await db.execute(q)).scalars().all()
    types = dict((await db.execute(
        select(VehicleType.id, VehicleType.name).where(VehicleType.organization_id == user["org_id"])
    )).all())
    return [
        SUDocumentListItem(
            id=d.id, document_id=d.document_id, revision=d.baseline_number, title=d.title,
            vehicle_type_id=d.vehicle_type_id, vehicle_type_name=types.get(d.vehicle_type_id, "—"),
            status=d.status, vv_status=d.vv_status,
            rxswins=sorted(a.rxswin_ref.rxswin for a in d.affected_rxswins),
            target_count=len(d.targets), applied_count=sum(1 for t in d.targets if t.result == "success"),
            released_at=d.released_at, updated_at=d.updated_at,
        )
        for d in docs
    ]


@router.post("", response_model=SUDocumentDetail, status_code=status.HTTP_201_CREATED)
async def create_document(data: SUDocumentCreate, user: NonPartnerDep, db: DbSession):
    vt = await db.scalar(
        select(VehicleType).where(VehicleType.id == data.vehicle_type_id, VehicleType.organization_id == user["org_id"])
    )
    if not vt:
        raise HTTPException(status_code=404, detail="Tip vozila ne obstaja")

    # Zaporedna oznaka SU-<leto>-<NNN> v organizaciji
    year = _now().year
    prefix = f"SU-{year}-"
    last = await db.scalar(
        select(func.max(SoftwareUpdateDocument.document_id)).where(
            SoftwareUpdateDocument.organization_id == user["org_id"],
            SoftwareUpdateDocument.document_id.like(f"{prefix}%"),
        )
    )
    number = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    doc = SoftwareUpdateDocument(
        organization_id=user["org_id"], vehicle_type_id=vt.id, document_id=f"{prefix}{number:03d}",
        title=data.title, description_purpose=data.description_purpose,
        status="draft", baseline_number=1, vv_status="pending",
        user_notification_required=True, new_hardware_required=False, created_by=user["user_id"],
    )
    db.add(doc)
    await db.flush()
    await _audit(db, user, "create", "software_update", doc.id, after={
        "document_id": doc.document_id, "revision": 1, "vehicle_type": vt.name,
        "title": doc.title, "description_purpose": doc.description_purpose,
    })
    await db.commit()
    return await _reload(db, doc.id, user["org_id"])


@router.get("/{doc_id}", response_model=SUDocumentDetail)
async def get_document(doc_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    return await _reload(db, doc_id, user["org_id"])


@router.put("/{doc_id}", response_model=SUDocumentDetail)
async def update_document(doc_id: uuid.UUID, data: SUDocumentUpdate, user: NonPartnerDep, db: DbSession):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if k in EDITABLE_FIELDS}
    before = {k: _jsonable(getattr(doc, k)) for k in changes}
    for k, v in changes.items():
        setattr(doc, k, v)
    await _audit(db, user, "update", "software_update", doc.id,
                 before=before, after={k: _jsonable(v) for k, v in changes.items()})
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_draft(doc_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    await _audit(db, user, "delete", "software_update", doc.id, before={
        "document_id": doc.document_id, "revision": doc.baseline_number, "title": doc.title,
    })
    await db.delete(doc)
    await db.commit()


# ─── V&V podpis ───────────────────────────────────────────────────────────────

@router.post("/{doc_id}/vv", response_model=SUDocumentDetail)
async def sign_vv(doc_id: uuid.UUID, data: VVSignRequest, db: DbSession, user: dict = ReleaseDep):
    """Inženirski podpis verifikacije in validacije (§7.1.3.3, §7.1.2.5 (i))."""
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    before = {"vv_status": doc.vv_status, "vv_method": doc.vv_method}
    doc.vv_status = data.vv_status
    doc.vv_method = data.vv_method
    doc.vv_signed_by = user["user_id"]
    doc.vv_signed_at = _now()
    await _audit(db, user, "sign", "software_update", doc.id, before=before,
                 after={"vv_status": data.vv_status, "vv_method": data.vv_method})
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


# ─── Prizadeti RXSWIN-i ───────────────────────────────────────────────────────

@router.post("/{doc_id}/rxswins", response_model=SUDocumentDetail, status_code=status.HTTP_201_CREATED)
async def add_affected_rxswin(doc_id: uuid.UUID, data: AffectedRxswinCreate, user: NonPartnerDep, db: DbSession):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    rx = await db.scalar(select(RXSWIN).where(RXSWIN.id == data.rxswin_id, RXSWIN.organization_id == user["org_id"]))
    if not rx:
        raise HTTPException(status_code=404, detail="RXSWIN ne obstaja")
    if rx.vehicle_type_id != doc.vehicle_type_id:
        raise HTTPException(status_code=422, detail="RXSWIN ne pripada tipu vozila tega dokumenta")
    if any(a.rxswin_id == rx.id for a in doc.affected_rxswins):
        raise HTTPException(status_code=409, detail=f"{rx.rxswin} je že naveden")
    after = await db.scalar(
        select(RXSWINBaseline).where(RXSWINBaseline.id == data.baseline_after_id, RXSWINBaseline.rxswin_id == rx.id)
    )
    if not after:
        raise HTTPException(status_code=422, detail="Baseline ne pripada temu RXSWIN-u")
    # 'pred' = trenutno izdani baseline, če ni to že ciljni
    before = await db.scalar(
        select(RXSWINBaseline).where(RXSWINBaseline.rxswin_id == rx.id, RXSWINBaseline.status == "released")
    )
    before_id = before.id if before and before.id != after.id else None
    if before_id is None and after.status == "released":
        prev = await db.scalar(
            select(RXSWINBaseline)
            .where(RXSWINBaseline.rxswin_id == rx.id, RXSWINBaseline.baseline_number < after.baseline_number)
            .order_by(RXSWINBaseline.baseline_number.desc()).limit(1)
        )
        before_id = prev.id if prev else None
    link = SoftwareUpdateRXSWIN(
        software_update_id=doc.id, rxswin_id=rx.id, baseline_before_id=before_id, baseline_after_id=after.id,
    )
    db.add(link)
    await db.flush()
    await _audit(db, user, "create", "software_update_rxswin", link.id, after={
        "document_id": doc.document_id, "rxswin": rx.rxswin,
        "baseline_before_id": str(before_id) if before_id else None, "baseline_after": after.baseline_number,
    })
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


@router.delete("/{doc_id}/rxswins/{link_id}", response_model=SUDocumentDetail)
async def remove_affected_rxswin(doc_id: uuid.UUID, link_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    link = next((a for a in doc.affected_rxswins if a.id == link_id), None)
    if not link:
        raise HTTPException(status_code=404, detail="Povezava ne obstaja")
    await _audit(db, user, "delete", "software_update_rxswin", link.id,
                 before={"document_id": doc.document_id, "rxswin": link.rxswin_ref.rxswin})
    await db.delete(link)
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


# ─── Ciljna vozila (§7.1.1.6, §7.1.1.7, §7.1.2.4) ────────────────────────────

@router.post("/{doc_id}/targets", response_model=SUDocumentDetail, status_code=status.HTTP_201_CREATED)
async def add_targets(doc_id: uuid.UUID, data: TargetsAdd, user: NonPartnerDep, db: DbSession):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    vehicles = (await db.execute(
        select(Vehicle).where(Vehicle.id.in_(data.vehicle_ids), Vehicle.organization_id == user["org_id"])
    )).scalars().all()
    if len(vehicles) != len(set(data.vehicle_ids)):
        raise HTTPException(status_code=404, detail="Eno ali več vozil ne obstaja")
    wrong = [v.vin for v in vehicles if v.vehicle_type_id != doc.vehicle_type_id]
    if wrong:
        # §7.1.1.6: napačno identificirano ciljno vozilo je glavni vir napak — zavrnemo
        raise HTTPException(status_code=422, detail=f"Vozila niso tega tipa: {', '.join(sorted(wrong))}")
    existing = {t.vehicle_id for t in doc.targets}
    added = []
    for v in vehicles:
        if v.id in existing:
            continue
        db.add(SoftwareUpdateTarget(software_update_id=doc.id, vehicle_id=v.id, compatibility_confirmed=False))
        added.append(v.vin)
    await db.flush()
    if added:
        await _audit(db, user, "create", "software_update_target", doc.id,
                     after={"document_id": doc.document_id, "vins": sorted(added)})
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


def _find_target(doc: SoftwareUpdateDocument, target_id: uuid.UUID) -> SoftwareUpdateTarget:
    t = next((t for t in doc.targets if t.id == target_id), None)
    if not t:
        raise HTTPException(status_code=404, detail="Ciljno vozilo ne obstaja")
    return t


async def _vin(db, vehicle_id) -> str:
    return await db.scalar(select(Vehicle.vin).where(Vehicle.id == vehicle_id)) or "—"


@router.put("/{doc_id}/targets/{target_id}", response_model=SUDocumentDetail)
async def confirm_compatibility(
    doc_id: uuid.UUID, target_id: uuid.UUID, data: TargetCompatibility, user: NonPartnerDep, db: DbSession,
):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    t = _find_target(doc, target_id)
    before = {"compatibility_confirmed": t.compatibility_confirmed, "compatibility_notes": t.compatibility_notes}
    t.compatibility_confirmed = data.compatibility_confirmed
    t.compatibility_notes = data.compatibility_notes
    t.confirmed_by = user["user_id"] if data.compatibility_confirmed else None
    t.confirmed_at = _now() if data.compatibility_confirmed else None
    await _audit(db, user, "update", "software_update_target", t.id, before=before, after={
        "document_id": doc.document_id, "vin": await _vin(db, t.vehicle_id),
        "compatibility_confirmed": data.compatibility_confirmed, "compatibility_notes": data.compatibility_notes,
    })
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


@router.delete("/{doc_id}/targets/{target_id}", response_model=SUDocumentDetail)
async def remove_target(doc_id: uuid.UUID, target_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    t = _find_target(doc, target_id)
    await _audit(db, user, "delete", "software_update_target", t.id,
                 before={"document_id": doc.document_id, "vin": await _vin(db, t.vehicle_id)})
    await db.delete(t)
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


@router.post("/{doc_id}/targets/{target_id}/result", response_model=SUDocumentDetail)
async def record_result(
    doc_id: uuid.UUID, target_id: uuid.UUID, data: TargetResult, user: NonPartnerDep, db: DbSession,
):
    """Izvedba posodobitve na vozilu — dovoljena samo za izdan dokument."""
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    if doc.status != "released":
        raise HTTPException(status_code=409, detail="Izvedbo je mogoče zapisati le za izdan dokument")
    t = _find_target(doc, target_id)
    if t.result:
        # zapis izvedbe je dokaz — ne prepisuje se
        raise HTTPException(status_code=409, detail="Izvedba za to vozilo je že zapisana")
    t.result = data.result
    t.applied_at = data.applied_at or _now()
    t.applied_by = user["user_id"]
    after = {
        "document_id": doc.document_id, "revision": doc.baseline_number, "vin": await _vin(db, t.vehicle_id),
        "result": data.result, "applied_at": _jsonable(t.applied_at),
    }
    if data.result == "success":
        # §7.1.2.2: nova zadnja znana konfiguracija vozila = prejšnja + novi baseline-i
        vehicle = await db.get(Vehicle, t.vehicle_id)
        installed = installed_baselines(await current_configuration(db, vehicle.id))
        for a in doc.affected_rxswins:
            installed[str(a.rxswin_id)] = str(a.baseline_after_id)
        cfg = await record_configuration(
            db, vehicle, config_type="last_known", installed=installed,
            reason=f"{doc.document_id} rev. {doc.baseline_number}", user_id=user["user_id"],
            software_update_id=doc.id, erp_work_order=doc.erp_work_order,
        )
        after["last_known_configuration"] = cfg.config_id
    await _audit(db, user, "apply", "software_update_target", t.id, before={"result": None}, after=after)
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


# ─── Obvestilo uporabniku (§7.1.1.11) ─────────────────────────────────────────

@router.post("/{doc_id}/notification", response_model=SUDocumentDetail)
async def record_notification(doc_id: uuid.UUID, data: UserNotification, user: NonPartnerDep, db: DbSession):
    """Zapis, da je bil uporabnik (upravljavec flote) obveščen — kdo, kdaj, kako."""
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    if doc.status == "superseded":
        raise HTTPException(status_code=409, detail="Dokument je nadomeščen")
    before = {"user_notification_method": doc.user_notification_method, "user_notified_at": _jsonable(doc.user_notified_at)}
    doc.user_notification_method = data.method
    doc.user_notified_at = data.notified_at or _now()
    doc.user_notified_by = user["user_id"]
    await _audit(db, user, "notify", "software_update", doc.id, before=before, after={
        "document_id": doc.document_id, "method": data.method, "notified_at": _jsonable(doc.user_notified_at),
    })
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


# ─── Izdaja in revizija ───────────────────────────────────────────────────────

@router.post("/{doc_id}/release", response_model=SUDocumentDetail)
async def release_document(doc_id: uuid.UUID, db: DbSession, user: dict = ReleaseDep):
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    _require_draft(doc)
    blockers = await _release_blockers(db, doc)
    if blockers:
        raise HTTPException(status_code=422, detail={"code": "release_blocked", "blockers": blockers})

    if doc.supersedes_id:
        prev = await db.scalar(
            select(SoftwareUpdateDocument).where(SoftwareUpdateDocument.id == doc.supersedes_id).with_for_update()
        )
        if prev and prev.status == "released":
            prev.status = "superseded"
            await _audit(db, user, "supersede", "software_update", prev.id, before={"status": "released"},
                         after={"status": "superseded", "superseded_by_revision": doc.baseline_number})
    doc.status = "released"
    doc.released_at = _now()
    doc.released_by = user["user_id"]
    # updated_at nastavi baza ob flushu — osveži, preden ga _detail prebere
    await db.flush()
    await db.refresh(doc, ["updated_at"])
    detail = await _detail(db, doc)
    await _audit(db, user, "release", "software_update", doc.id, before={"status": "draft"}, after={
        "status": "released", "document_id": doc.document_id, "revision": doc.baseline_number,
        "rxswins": [f"{a.rxswin} B{a.baseline_before_number or '-'}→B{a.baseline_after_number}" for a in detail.affected_rxswins],
        "targets": [t.vin for t in detail.targets],
        "vv_status": doc.vv_status,
        "type_approval_update_necessary": doc.type_approval_update_necessary,
    })
    await db.commit()
    return await _reload(db, doc_id, user["org_id"])


@router.post("/{doc_id}/revise", response_model=SUDocumentDetail, status_code=status.HTTP_201_CREATED)
async def revise_document(doc_id: uuid.UUID, user: NonPartnerDep, db: DbSession):
    """Nova revizija izdanega dokumenta. V&V in potrditve združljivosti je treba ponoviti."""
    doc = await _load(db, doc_id, user["org_id"], lock=True)
    if doc.status != "released":
        raise HTTPException(status_code=409, detail="Revizijo je mogoče odpreti le iz izdanega dokumenta")
    open_draft = await db.scalar(
        select(SoftwareUpdateDocument.id).where(
            SoftwareUpdateDocument.organization_id == user["org_id"],
            SoftwareUpdateDocument.document_id == doc.document_id,
            SoftwareUpdateDocument.status == "draft",
        )
    )
    if open_draft:
        raise HTTPException(status_code=409, detail="Za ta dokument že obstaja odprta revizija")
    new = SoftwareUpdateDocument(
        organization_id=doc.organization_id, vehicle_type_id=doc.vehicle_type_id, document_id=doc.document_id,
        baseline_number=doc.baseline_number + 1, supersedes_id=doc.id, status="draft",
        vv_status="pending", created_by=user["user_id"],
        **{f: getattr(doc, f) for f in EDITABLE_FIELDS},
    )
    db.add(new)
    await db.flush()
    for a in doc.affected_rxswins:
        db.add(SoftwareUpdateRXSWIN(
            software_update_id=new.id, rxswin_id=a.rxswin_id,
            baseline_before_id=a.baseline_before_id, baseline_after_id=a.baseline_after_id,
        ))
    for t in doc.targets:
        db.add(SoftwareUpdateTarget(software_update_id=new.id, vehicle_id=t.vehicle_id, compatibility_confirmed=False))
    await db.flush()
    await _audit(db, user, "create", "software_update", new.id, after={
        "document_id": new.document_id, "revision": new.baseline_number, "revises_revision": doc.baseline_number,
    })
    await db.commit()
    return await _reload(db, new.id, user["org_id"])


# ─── Poročilo (PDF) ───────────────────────────────────────────────────────────

@router.get("/{doc_id}/report.pdf")
async def document_report(doc_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    from app.services.r156_reports import render_software_update_pdf

    detail = await _reload(db, doc_id, user["org_id"])
    pdf = render_software_update_pdf(detail)
    filename = f"{detail.document_id} rev{detail.revision} - Software Update.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
