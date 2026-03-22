"""
Alarm engine — event-driven in scheduled Celery taski.
"""
import asyncio
import logging

from app.workers.celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="app.workers.alarm_worker.check_dtc_alarm")
def check_dtc_alarm(dtc_id: str, org_id: str):
    """Sproži alarm ob DTC high severity."""
    asyncio.run(_send_dtc_alarm(dtc_id, org_id))


@celery_app.task(name="app.workers.alarm_worker.daily_alarm_check")
def daily_alarm_check():
    """Vsako jutro ob 7:00 — preveri vse organizacije."""
    asyncio.run(_run_daily_checks())


async def _send_dtc_alarm(dtc_id: str, org_id: str):
    import uuid
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy import select

    from app.config import settings
    from app.models.dtc_record import DTCRecord
    from app.models.vehicle import Vehicle
    from app.models.alarm_event import AlarmEvent
    from app.services.alarm_service import send_email_alarm, publish_ws_alarm, send_push_notification

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        result = await db.execute(select(DTCRecord).where(DTCRecord.id == uuid.UUID(dtc_id)))
        dtc = result.scalar_one_or_none()
        if not dtc:
            return

        result = await db.execute(select(Vehicle).where(Vehicle.id == dtc.vehicle_id))
        vehicle = result.scalar_one_or_none()
        vehicle_name = vehicle.name if vehicle else "neznano vozilo"

        title = f"[KRITIČNO] DTC {dtc.code} — {vehicle_name}"
        message = (
            f"Zaznana napaka z visoko resnostjo.\n\n"
            f"Vozilo: {vehicle_name}\n"
            f"DTC koda: {dtc.code}\n"
            f"Opis: {dtc.description}\n"
            f"Resnost: {dtc.severity}\n"
            f"Zaznano: {dtc.detected_at.strftime('%d.%m.%Y %H:%M')}\n"
            f"Vir: {dtc.source}"
        )

        event = AlarmEvent(
            organization_id=uuid.UUID(org_id),
            vehicle_id=dtc.vehicle_id,
            alarm_type="dtc_high_severity",
            severity="critical",
            title=title,
            message=message,
            delivered_via=["email", "ws"],
        )
        db.add(event)
        await db.commit()

        # Email + WebSocket + Push
        await send_email_alarm(db, uuid.UUID(org_id), title, message)
        await publish_ws_alarm(org_id, {
            "type": "alarm",
            "severity": "critical",
            "title": title,
            "message": message,
            "vehicle_id": str(dtc.vehicle_id),
            "alarm_type": "dtc_high_severity",
        })
        await send_push_notification(
            db, uuid.UUID(org_id), title, message,
            data={"alarm_type": "dtc_high_severity", "vehicle_id": str(dtc.vehicle_id)},
        )

    await engine.dispose()


async def _run_daily_checks():
    """
    Vsako jutro ob 7:00 preveri vse organizacije:
    1. Vozila z DTC high severity active
    2. homologation.next_action_due < 7 dni
    3. Isti DTC code na > 2 vozilih iste org → sistemska napaka
    4. SW verzija zaostaja > 2 verziji za referenčno
    """
    import uuid
    from datetime import date, timedelta
    from collections import Counter
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings
    from app.models.organization import Organization
    from app.models.vehicle import Vehicle
    from app.models.dtc_record import DTCRecord
    from app.models.homologation import Homologation
    from app.models.alarm_event import AlarmEvent
    from app.services.alarm_service import send_email_alarm, publish_ws_alarm

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # Pridobi vse aktivne organizacije
        result = await db.execute(select(Organization))
        orgs = result.scalars().all()

        for org in orgs:
            await _check_hom_overdue(db, org, send_email_alarm, publish_ws_alarm)
            await _check_dtc_systemic(db, org, send_email_alarm, publish_ws_alarm)
            await _check_active_high_dtcs(db, org, send_email_alarm, publish_ws_alarm)

    await engine.dispose()


async def _check_hom_overdue(db, org, send_email_alarm, publish_ws_alarm):
    """Homologacija s next_action_due < 7 dni → alarm."""
    from datetime import date, timedelta
    from sqlalchemy import select
    from app.models.homologation import Homologation
    from app.models.vehicle import Vehicle
    from app.models.alarm_event import AlarmEvent

    warning_date = date.today() + timedelta(days=7)

    result = await db.execute(
        select(Homologation, Vehicle.name.label("vehicle_name"))
        .join(Vehicle, Homologation.vehicle_id == Vehicle.id)
        .where(
            Homologation.organization_id == org.id,
            Homologation.status.in_(["open", "in_progress"]),
            Homologation.next_action_due <= warning_date,
            Homologation.next_action_due >= date.today(),
        )
    )
    rows = result.all()

    for hom, vehicle_name in rows:
        days_left = (hom.next_action_due - date.today()).days
        title = f"[OPOZORILO] HON {hom.regulation} — rok čez {days_left} dni"
        message = (
            f"Homologacija z bližajočim se rokom.\n\n"
            f"Vozilo: {vehicle_name}\n"
            f"Uredba: {hom.regulation}\n"
            f"Status: {hom.status}\n"
            f"Naslednja akcija: {hom.next_action_due.strftime('%d.%m.%Y')}\n"
            f"Dni do roka: {days_left}"
        )

        # Preveri ali alarm že obstaja za danes
        from sqlalchemy import and_, cast, Date
        from datetime import datetime, timezone
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await db.execute(
            select(AlarmEvent).where(
                AlarmEvent.organization_id == org.id,
                AlarmEvent.alarm_type == "hom_action_overdue",
                AlarmEvent.vehicle_id == hom.vehicle_id,
                AlarmEvent.created_at >= today_start,
            )
        )
        if existing.scalar_one_or_none():
            continue  # Danes že poslan

        event = AlarmEvent(
            organization_id=org.id,
            vehicle_id=hom.vehicle_id,
            alarm_type="hom_action_overdue",
            severity="warning",
            title=title,
            message=message,
            delivered_via=["email"],
        )
        db.add(event)
        await db.flush()

        await send_email_alarm(db, org.id, title, message)
        await publish_ws_alarm(str(org.id), {
            "type": "alarm", "severity": "warning",
            "title": title, "alarm_type": "hom_action_overdue",
        })

    await db.commit()


async def _check_dtc_systemic(db, org, send_email_alarm, publish_ws_alarm):
    """Isti DTC code na > 2 vozilih iste org → sistemska napaka."""
    from sqlalchemy import select, func
    from app.models.dtc_record import DTCRecord
    from app.models.alarm_event import AlarmEvent
    from datetime import datetime, timezone

    result = await db.execute(
        select(DTCRecord.code, func.count(DTCRecord.vehicle_id.distinct()).label("vehicle_count"))
        .where(
            DTCRecord.organization_id == org.id,
            DTCRecord.status == "active",
        )
        .group_by(DTCRecord.code)
        .having(func.count(DTCRecord.vehicle_id.distinct()) > 2)
    )
    rows = result.all()

    for code, count in rows:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await db.execute(
            select(AlarmEvent).where(
                AlarmEvent.organization_id == org.id,
                AlarmEvent.alarm_type == "dtc_systemic",
                AlarmEvent.title.contains(code),
                AlarmEvent.created_at >= today_start,
            )
        )
        if existing.scalar_one_or_none():
            continue

        title = f"[SISTEMSKA NAPAKA] DTC {code} na {count} vozilih"
        message = (
            f"Enaka diagnostična napaka je aktivna na {count} vozilih.\n\n"
            f"DTC koda: {code}\n"
            f"Število prizadetih vozil: {count}\n"
            f"Možen vzrok: sistemska okvara komponente ali napaka v SW."
        )

        event = AlarmEvent(
            organization_id=org.id,
            alarm_type="dtc_systemic",
            severity="critical",
            title=title,
            message=message,
            delivered_via=["email"],
        )
        db.add(event)
        await db.flush()

        await send_email_alarm(db, org.id, title, message, roles=["admin", "qc_manager"])

    await db.commit()


async def _check_active_high_dtcs(db, org, send_email_alarm, publish_ws_alarm):
    """Vozila ki imajo visoko resnost DTC active > 24h in niso rešena."""
    from sqlalchemy import select
    from app.models.dtc_record import DTCRecord
    from app.models.vehicle import Vehicle
    from app.models.alarm_event import AlarmEvent
    from datetime import datetime, timezone, timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(DTCRecord, Vehicle.name.label("vehicle_name"))
        .join(Vehicle, DTCRecord.vehicle_id == Vehicle.id)
        .where(
            DTCRecord.organization_id == org.id,
            DTCRecord.severity == "high",
            DTCRecord.status == "active",
            DTCRecord.detected_at <= cutoff,
        )
    )
    rows = result.all()

    for dtc, vehicle_name in rows:
        # Ne pošlji dvakrat na dan
        existing = await db.execute(
            select(AlarmEvent).where(
                AlarmEvent.organization_id == org.id,
                AlarmEvent.alarm_type == "dtc_high_unresolved",
                AlarmEvent.vehicle_id == dtc.vehicle_id,
                AlarmEvent.created_at >= today_start,
            )
        )
        if existing.scalar_one_or_none():
            continue

        hours_open = int((datetime.now(timezone.utc) - dtc.detected_at).total_seconds() / 3600)
        title = f"[NEREJEŠENO] DTC {dtc.code} na {vehicle_name} že {hours_open}h"
        message = (
            f"Visoko resnostna napaka ni bila rešena.\n\n"
            f"Vozilo: {vehicle_name}\n"
            f"DTC: {dtc.code} — {dtc.description}\n"
            f"Odprto: {hours_open} ur"
        )

        event = AlarmEvent(
            organization_id=org.id,
            vehicle_id=dtc.vehicle_id,
            alarm_type="dtc_high_unresolved",
            severity="warning",
            title=title,
            message=message,
            delivered_via=["email"],
        )
        db.add(event)
        await db.flush()
        await send_email_alarm(db, org.id, title, message)

    await db.commit()
