"""
OBD-II modul — Faza 6

Sprejema podatke iz OBD-II adapterjev (ELM327, J2534, K-Line) in jih integrira v:
  - VehicleTwin.obd_live_data (live PID podatki)
  - DTCRecord (odkrite napake, source='obd')
  - Alarm engine (high severity DTC → alarm)
  - Audit log (R156 §7.4)

Primarni endpoint: POST /obd/{vehicle_id}/scan
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession
from app.models.obd_session import OBDSession
from app.models.dtc_record import DTCRecord
from app.models.vehicle import Vehicle
from app.models.vehicle_twin import VehicleTwin
from app.schemas.obd import (
    OBDScanRequest,
    OBDScanResponse,
    OBDSessionResponse,
    OBDLiveDataResponse,
)
from app.utils.audit import write_audit_log

router = APIRouter()


# ─── OBD DTC pomožne funkcije ─────────────────────────────────────────────────

# Pogosti OBD-II DTC opisi (ISO 15031-6 / SAE J2012)
_DTC_DESCRIPTIONS: dict[str, str] = {
    # Powertrain — emisijski sistem
    "P0420": "Catalyst System Efficiency Below Threshold (Bank 1)",
    "P0430": "Catalyst System Efficiency Below Threshold (Bank 2)",
    "P0401": "EGR Flow Insufficient Detected",
    "P0402": "EGR Flow Excessive Detected",
    "P0171": "System Too Lean (Bank 1)",
    "P0172": "System Too Rich (Bank 1)",
    "P0300": "Random/Multiple Cylinder Misfire Detected",
    "P0301": "Cylinder 1 Misfire Detected",
    "P0302": "Cylinder 2 Misfire Detected",
    "P0303": "Cylinder 3 Misfire Detected",
    "P0304": "Cylinder 4 Misfire Detected",
    "P0340": "Camshaft Position Sensor Circuit Malfunction (Bank 1)",
    "P0113": "Intake Air Temperature Sensor Circuit High Input",
    "P0118": "Engine Coolant Temperature Sensor Circuit High Input",
    "P0128": "Coolant Thermostat Below Regulating Temperature",
    "P0500": "Vehicle Speed Sensor Malfunction",
    "P0505": "Idle Air Control System Malfunction",
    "P0600": "Serial Communication Link Malfunction",
    "P0700": "Transmission Control System Malfunction",
    # Chassis — varnostni sistemi
    "C0031": "Right Front Wheel Speed Sensor Circuit",
    "C0034": "Left Front Wheel Speed Sensor Circuit",
    "C0037": "Right Rear Wheel Speed Sensor Circuit",
    "C0040": "Left Rear Wheel Speed Sensor Circuit",
    "C0110": "ABS Motor Circuit Malfunction",
    "C0265": "EBCM Relay Circuit Active",
    "C0550": "ECU Malfunction",
    # Network — CAN bus
    "U0001": "High Speed CAN Communication Bus",
    "U0100": "Lost Communication With ECM/PCM",
    "U0101": "Lost Communication With TCM",
    "U0121": "Lost Communication With ABS Control Module",
    "U0140": "Lost Communication With Body Control Module",
    "U0155": "Lost Communication With Instrument Panel Cluster",
    "U0293": "Lost Communication With HV Battery Energy Control Module",
    # Body
    "B0001": "Driver Frontal Stage 1 Deployment Control",
    "B1000": "ECU Malfunction",
    "B2205": "Ignition Key-In Lamp Circuit Short To Battery",
}


def _get_dtc_description(code: str) -> str:
    """Vrni opis DTC kode iz tabele ali generiraj generičen opis."""
    code_upper = code.upper().strip()
    if code_upper in _DTC_DESCRIPTIONS:
        return _DTC_DESCRIPTIONS[code_upper]
    # Generiraj opis na podlagi prefiksa
    prefix = code_upper[0] if code_upper else "P"
    descriptions = {
        "P": f"Powertrain Fault: {code_upper}",
        "C": f"Chassis Fault: {code_upper}",
        "B": f"Body Fault: {code_upper}",
        "U": f"Network Communication Fault: {code_upper}",
    }
    return descriptions.get(prefix, f"Diagnostic Trouble Code: {code_upper}")


def _classify_severity(code: str) -> str:
    """Določi resnost DTC kode na podlagi SAE J2012 klasifikacije."""
    if not code or len(code) < 2:
        return "low"

    prefix = code[0].upper()
    sub = code[1:3].upper() if len(code) >= 3 else "00"

    # Chassis (varnostni sistemi — zavore, vzmetenje, volant)
    if prefix == "C":
        return "high"

    # Network — CAN bus izpadi (U0xxx)
    if prefix == "U":
        return "high" if sub == "00" else "medium"

    # Body — običajno nizka resnost
    if prefix == "B":
        return "low"

    # Powertrain
    if prefix == "P":
        # P01xx-P08xx: emisije, gorivo, zrak, motor
        if sub in ["01", "02", "03", "04", "05", "06", "07", "08"]:
            return "high"
        # P00xx: generični/emisijski
        if sub == "00":
            return "medium"
        # P3xxx: pomožni emisijski sistemi
        if code[1] == "3":
            return "medium"
        return "medium"

    return "medium"


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/{vehicle_id}/scan", response_model=OBDScanResponse, status_code=status.HTTP_201_CREATED)
async def obd_scan(vehicle_id: uuid.UUID, data: OBDScanRequest, user: CurrentUserDep, db: DbSession):
    """
    Glavni endpoint za OBD-II sken.

    Adapter (ELM327 / J2534) pokliče ta endpoint po zaključenem skeniranju.
    Backend:
    1. Validira vozilo
    2. Shrani OBD sejo
    3. Posodobi VehicleTwin.obd_live_data
    4. Importira DTC kode → DTCRecord (source='obd', preskoci duplikate)
    5. Sproži alarm za high-severity DTC
    6. Piše v audit log
    """
    # Validacija vozila
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    scanned_at = data.scanned_at or datetime.now(timezone.utc)
    live_data_dict = data.live_data.model_dump(exclude_none=True)

    # Ustvari OBD sejo
    session = OBDSession(
        vehicle_id=vehicle_id,
        organization_id=user["org_id"],
        adapter_type=data.adapter_type,
        adapter_id=data.adapter_id,
        protocol=data.protocol,
        status="completed",
        live_data=live_data_dict,
        raw_pids=data.raw_pids,
        dtcs_raw=[dtc.model_dump() for dtc in data.dtcs],
        dtc_count=len(data.dtcs),
        vin_from_obd=data.vin_from_obd,
        ecu_info=data.ecu_info,
        notes=data.notes,
        scanned_at=scanned_at,
        created_by=user["user_id"],
    )
    db.add(session)
    await db.flush()

    # Posodobi VehicleTwin.obd_live_data
    twin_result = await db.execute(select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle_id))
    twin = twin_result.scalar_one_or_none()
    if not twin:
        twin = VehicleTwin(vehicle_id=vehicle_id)
        db.add(twin)
        await db.flush()

    from sqlalchemy.orm.attributes import flag_modified

    new_live = dict(live_data_dict)
    new_live["last_updated"] = scanned_at.isoformat()
    new_live["session_id"] = str(session.id)
    new_live["adapter_type"] = data.adapter_type
    twin.obd_live_data = new_live
    flag_modified(twin, "obd_live_data")
    twin.last_obd_scan_at = scanned_at

    live_data_updated = True

    # Importiraj DTC kode
    dtcs_imported = 0
    dtcs_skipped = 0
    alarms_triggered = 0
    imported_dtc_ids: list[str] = []

    for raw_dtc in data.dtcs:
        code = raw_dtc.code.upper().strip()

        # Preskoci če že obstaja aktiven DTC z isto kodo za to vozilo
        existing = await db.execute(
            select(DTCRecord).where(
                DTCRecord.vehicle_id == vehicle_id,
                DTCRecord.organization_id == user["org_id"],
                DTCRecord.code == code,
                DTCRecord.status == "active",
            )
        )
        if existing.scalar_one_or_none():
            dtcs_skipped += 1
            continue

        severity = _classify_severity(code)
        description = _get_dtc_description(code)

        dtc = DTCRecord(
            vehicle_id=vehicle_id,
            organization_id=user["org_id"],
            code=code,
            description=description,
            severity=severity,
            status="active",
            detected_at=scanned_at,
            source="obd",
            created_by=user["user_id"],
        )
        db.add(dtc)
        await db.flush()

        await write_audit_log(
            db=db,
            org_id=user["org_id"],
            actor_id=user["user_id"],
            actor_type="user",
            actor_device="obd_adapter",
            action="create",
            entity_type="dtc_record",
            entity_id=dtc.id,
            after={
                "vehicle_id": str(vehicle_id),
                "code": code,
                "severity": severity,
                "status": "active",
                "source": "obd",
                "session_id": str(session.id),
            },
        )

        imported_dtc_ids.append(str(dtc.id))
        dtcs_imported += 1

        if severity == "high":
            alarms_triggered += 1

    # Posodobi štetje v seji
    session.dtcs_imported = dtcs_imported
    session.dtcs_skipped = dtcs_skipped

    # Audit log za OBD sken
    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="obd_adapter",
        action="create",
        entity_type="obd_session",
        entity_id=session.id,
        after={
            "vehicle_id": str(vehicle_id),
            "adapter_type": data.adapter_type,
            "adapter_id": data.adapter_id,
            "dtc_count": len(data.dtcs),
            "dtcs_imported": dtcs_imported,
            "dtcs_skipped": dtcs_skipped,
            "protocol": data.protocol,
        },
    )

    await db.commit()
    await db.refresh(session)

    # Celery workers
    from app.workers.twin_worker import update_vehicle_twin
    from app.workers.alarm_worker import check_dtc_alarm

    update_vehicle_twin.delay(str(vehicle_id), "obd", str(session.id))

    for dtc_id in imported_dtc_ids:
        dtc_result = await db.execute(select(DTCRecord).where(DTCRecord.id == uuid.UUID(dtc_id)))
        dtc = dtc_result.scalar_one_or_none()
        if dtc and dtc.severity == "high":
            check_dtc_alarm.delay(str(dtc.id), str(user["org_id"]))

    return OBDScanResponse(
        session_id=session.id,
        vehicle_id=vehicle_id,
        status="completed",
        dtcs_found=len(data.dtcs),
        dtcs_imported=dtcs_imported,
        dtcs_skipped=dtcs_skipped,
        live_data_updated=live_data_updated,
        twin_updated=True,
        alarms_triggered=alarms_triggered,
        scanned_at=scanned_at,
    )


@router.get("/{vehicle_id}/sessions", response_model=list[OBDSessionResponse])
async def list_obd_sessions(
    vehicle_id: uuid.UUID,
    user: CurrentUserDep,
    db: DbSession,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """Seznam OBD sej za vozilo."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    q = (
        select(OBDSession)
        .where(OBDSession.vehicle_id == vehicle_id, OBDSession.organization_id == user["org_id"])
        .order_by(OBDSession.scanned_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{vehicle_id}/sessions/{session_id}", response_model=OBDSessionResponse)
async def get_obd_session(vehicle_id: uuid.UUID, session_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    """Podrobnosti OBD seje."""
    result = await db.execute(
        select(OBDSession).where(
            OBDSession.id == session_id,
            OBDSession.vehicle_id == vehicle_id,
            OBDSession.organization_id == user["org_id"],
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="OBD seja ne obstaja")
    return session


@router.get("/{vehicle_id}/live", response_model=OBDLiveDataResponse)
async def get_obd_live_data(vehicle_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    """
    Trenutni live OBD podatki iz VehicleTwin.
    Vrne zadnje znane PID vrednosti (iz zadnjega skena).
    """
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    twin_result = await db.execute(select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle_id))
    twin = twin_result.scalar_one_or_none()

    if not twin or not twin.obd_live_data:
        return OBDLiveDataResponse(
            vehicle_id=vehicle_id,
            live_data={},
            last_session_id=None,
            last_scanned_at=None,
            has_data=False,
        )

    live = twin.obd_live_data
    return OBDLiveDataResponse(
        vehicle_id=vehicle_id,
        live_data=live,
        last_session_id=live.get("session_id"),
        last_scanned_at=live.get("last_updated"),
        has_data=True,
    )
