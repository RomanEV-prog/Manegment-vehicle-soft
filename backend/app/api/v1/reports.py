import csv
import io
import uuid

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, JSONResponse, StreamingResponse
from sqlalchemy import select, func

from app.api.deps import CurrentUserDep, DbSession
from app.models.vehicle import Vehicle
from app.models.dtc_record import DTCRecord
from app.models.sw_update import SWUpdate
from app.models.homologation import Homologation
from app.models.vehicle_twin import VehicleTwin
from app.models.service_record import ServiceRecord
from app.services.report_service import generate_sums_pdf, generate_hom_report_pdf

router = APIRouter()


@router.get("/sums")
async def sums_report(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID = Query(...),
    format: str = Query("pdf", regex="^(pdf|html)$"),
):
    """SUMS poročilo za vozilo — UNECE R156 §7.1, §7.2, §7.4."""
    try:
        pdf_bytes = await generate_sums_pdf(db, vehicle_id, user["org_id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if format == "html":
        return Response(content=pdf_bytes, media_type="text/html; charset=utf-8")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=SUMS_{vehicle_id}.pdf"},
    )


@router.get("/fleet-status")
async def fleet_status_report(user: CurrentUserDep, db: DbSession):
    """Pregled celotnega voznega parka — agregiran status."""
    # Vozila
    result = await db.execute(
        select(Vehicle).where(Vehicle.organization_id == user["org_id"])
    )
    vehicles = result.scalars().all()

    # Aktivni DTC high
    result = await db.execute(
        select(func.count()).where(
            DTCRecord.organization_id == user["org_id"],
            DTCRecord.severity == "high",
            DTCRecord.status == "active",
        )
    )
    active_high_dtcs = result.scalar()

    # Odprte homologacije
    result = await db.execute(
        select(func.count()).where(
            Homologation.organization_id == user["org_id"],
            Homologation.status.in_(["pending", "in_progress"]),
        )
    )
    open_homs = result.scalar()

    # SW posodobitve zadnjih 30 dni
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=30)
    result = await db.execute(
        select(func.count()).where(
            SWUpdate.organization_id == user["org_id"],
            SWUpdate.date >= cutoff,
        )
    )
    recent_sw = result.scalar()

    # Per-vehicle summary
    vehicle_summaries = []
    for v in vehicles:
        # Twin
        twin_result = await db.execute(
            select(VehicleTwin).where(VehicleTwin.vehicle_id == v.id)
        )
        twin = twin_result.scalar_one_or_none()

        # Aktivni DTC
        dtc_result = await db.execute(
            select(func.count()).where(
                DTCRecord.vehicle_id == v.id,
                DTCRecord.status == "active",
            )
        )
        dtc_count = dtc_result.scalar()

        vehicle_summaries.append({
            "id": str(v.id),
            "name": v.name,
            "vin": v.vin,
            "model": v.model,
            "status": v.status,
            "project_name": v.project_name,
            "active_dtc_count": dtc_count,
            "active_dtcs_high": sum(
                1 for d in (twin.active_dtcs if twin else [])
                if d.get("severity") == "high"
            ),
            "ecu_modules": len(twin.ecu_config) if twin else 0,
            "last_sw_update": twin.last_sw_update_at.isoformat() if twin and twin.last_sw_update_at else None,
            "last_service": twin.last_service_at.isoformat() if twin and twin.last_service_at else None,
        })

    return {
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        "summary": {
            "total_vehicles": len(vehicles),
            "active_vehicles": sum(1 for v in vehicles if v.status == "active"),
            "in_service_vehicles": sum(1 for v in vehicles if v.status == "in_service"),
            "shipped_vehicles": sum(1 for v in vehicles if v.status == "shipped"),
            "active_high_dtcs": active_high_dtcs,
            "open_homologations": open_homs,
            "sw_updates_last_30_days": recent_sw,
        },
        "vehicles": vehicle_summaries,
    }


@router.get("/hom-overview")
async def hom_overview_report(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    format: str = Query("pdf", regex="^(pdf|html)$"),
):
    """HOM poročilo za GR organ / TÜV."""
    if not vehicle_id:
        raise HTTPException(status_code=400, detail="vehicle_id je obvezen")

    try:
        pdf_bytes = await generate_hom_report_pdf(db, vehicle_id, user["org_id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if format == "html":
        return Response(content=pdf_bytes, media_type="text/html; charset=utf-8")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=HOM_{vehicle_id}.pdf"},
    )


@router.get("/sw-updates-csv")
async def sw_updates_csv(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
):
    """
    CSV izvoz vseh SW posodobitev organizacije — za UNECE R156 revizijsko dokumentacijo.
    """
    q = select(SWUpdate, Vehicle).join(Vehicle, SWUpdate.vehicle_id == Vehicle.id).where(
        SWUpdate.organization_id == user["org_id"]
    )
    if vehicle_id:
        q = q.where(SWUpdate.vehicle_id == vehicle_id)
    q = q.order_by(SWUpdate.date.desc())

    result = await db.execute(q)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Datum", "Vozilo", "VIN", "ECU modul",
        "Verzija pred", "Verzija po", "RXSWIN", "Metoda", "Status", "Opombe",
    ])
    for sw, vehicle in rows:
        writer.writerow([
            sw.date.isoformat(),
            vehicle.name,
            vehicle.vin,
            sw.ecu_module,
            sw.version_before,
            sw.version_after,
            sw.rxswin,
            sw.method,
            sw.status,
            sw.notes or "",
        ])

    filename = f"SW_posodobitve_{vehicle_id or 'vse'}.csv"
    return Response(
        content=output.getvalue().encode("utf-8-sig"),  # BOM za Excel
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/dtc-records-csv")
async def dtc_records_csv(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
):
    """
    CSV izvoz DTC zapisov — za servisno in revizijsko dokumentacijo.
    """
    q = select(DTCRecord, Vehicle).join(Vehicle, DTCRecord.vehicle_id == Vehicle.id).where(
        DTCRecord.organization_id == user["org_id"]
    )
    if vehicle_id:
        q = q.where(DTCRecord.vehicle_id == vehicle_id)
    if status:
        q = q.where(DTCRecord.status == status)
    q = q.order_by(DTCRecord.detected_at.desc())

    result = await db.execute(q)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Zaznano", "Vozilo", "VIN", "Koda DTC",
        "Opis", "Resnost", "Status", "Vir", "Rešeno",
    ])
    for dtc, vehicle in rows:
        writer.writerow([
            dtc.detected_at.date().isoformat() if dtc.detected_at else "",
            vehicle.name,
            vehicle.vin,
            dtc.code,
            dtc.description,
            dtc.severity,
            dtc.status,
            dtc.source,
            dtc.resolved_at.date().isoformat() if dtc.resolved_at else "",
        ])

    filename = f"DTC_zapisi_{vehicle_id or 'vse'}.csv"
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/homologations-csv")
async def homologations_csv(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
):
    """
    CSV izvoz homologacij — za revizijo pri organih (TÜV, GR_HOM, AVV).
    """
    q = (
        select(Homologation, Vehicle)
        .join(Vehicle, Homologation.vehicle_id == Vehicle.id)
        .where(Homologation.organization_id == user["org_id"])
    )
    if vehicle_id:
        q = q.where(Homologation.vehicle_id == vehicle_id)
    if status:
        q = q.where(Homologation.status == status)
    q = q.order_by(Homologation.regulation)

    result = await db.execute(q)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Vozilo", "VIN", "Uredba", "Status", "Oblast",
        "Država", "Veljavno od", "Veljavno do", "Naslednja akcija", "Opombe",
    ])
    for hom, vehicle in rows:
        writer.writerow([
            vehicle.name,
            vehicle.vin,
            hom.regulation,
            hom.status,
            hom.authority or "",
            hom.country or "",
            hom.valid_from.isoformat() if hom.valid_from else "",
            hom.valid_until.isoformat() if hom.valid_until else "",
            hom.next_action_due.isoformat() if hom.next_action_due else "",
            hom.notes or "",
        ])

    filename = f"Homologacije_{vehicle_id or 'vse'}.csv"
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/service-records-csv")
async def service_records_csv(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
):
    """
    CSV izvoz servisnih zapisov — za servisno dokumentacijo in SUMS revizijo.
    """
    q = (
        select(ServiceRecord, Vehicle)
        .join(Vehicle, ServiceRecord.vehicle_id == Vehicle.id)
        .where(ServiceRecord.organization_id == user["org_id"])
    )
    if vehicle_id:
        q = q.where(ServiceRecord.vehicle_id == vehicle_id)
    q = q.order_by(ServiceRecord.date.desc())

    result = await db.execute(q)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Datum", "Vozilo", "VIN", "Tip servisa",
        "Tehnik", "Opravila", "Opombe",
    ])
    for sr, vehicle in rows:
        writer.writerow([
            sr.date.isoformat() if sr.date else "",
            vehicle.name,
            vehicle.vin,
            sr.service_type,
            sr.technician,
            "; ".join(sr.items) if sr.items else "",
            sr.notes or "",
        ])

    filename = f"Servisni_zapisi_{vehicle_id or 'vse'}.csv"
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
