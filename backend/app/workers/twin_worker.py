"""
Digital twin updater — Celery task.
Posodobi vehicle_twin in ustvari snapshot ob vsakem posegu.
"""
import asyncio
from datetime import datetime, timezone

from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.twin_worker.update_vehicle_twin", bind=True, max_retries=3)
def update_vehicle_twin(self, vehicle_id: str, trigger_type: str, trigger_id: str):
    """
    trigger_type: 'service' | 'sw_update' | 'dtc' | 'homologation' | 'manual'
    """
    try:
        asyncio.run(_update_twin(vehicle_id, trigger_type, trigger_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


async def _update_twin(vehicle_id: str, trigger_type: str, trigger_id: str):
    import uuid
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy import select

    from app.config import settings
    from app.models.vehicle_twin import VehicleTwin
    from app.models.twin_snapshot import TwinSnapshot
    from app.models.sw_update import SWUpdate
    from app.models.dtc_record import DTCRecord
    from app.models.homologation import Homologation
    from app.models.service_record import ServiceRecord

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # Pridobi ali ustvari twin
        result = await db.execute(
            select(VehicleTwin).where(VehicleTwin.vehicle_id == uuid.UUID(vehicle_id))
        )
        twin = result.scalar_one_or_none()
        if not twin:
            twin = VehicleTwin(vehicle_id=uuid.UUID(vehicle_id))
            db.add(twin)

        trigger_label = trigger_type
        org_id = None

        # JSONB polja je treba eksplicitno označiti kot spremenjena
        from sqlalchemy.orm.attributes import flag_modified

        if trigger_type == "sw_update":
            result = await db.execute(select(SWUpdate).where(SWUpdate.id == uuid.UUID(trigger_id)))
            sw = result.scalar_one_or_none()
            if sw:
                org_id = sw.organization_id
                new_config = dict(twin.ecu_config or {})
                new_config[sw.ecu_module] = {
                    "version": sw.version_after,
                    "rxswin": sw.rxswin,
                    "updated_at": sw.date.isoformat(),
                }
                twin.ecu_config = new_config
                flag_modified(twin, "ecu_config")
                twin.last_sw_update_at = datetime.now(timezone.utc)
                trigger_label = f"OTA {sw.ecu_module}: {sw.version_before} → {sw.version_after}"

        elif trigger_type == "dtc":
            result = await db.execute(select(DTCRecord).where(DTCRecord.id == uuid.UUID(trigger_id)))
            dtc = result.scalar_one_or_none()
            if dtc:
                org_id = dtc.organization_id
                existing = [d for d in (twin.active_dtcs or []) if d.get("id") != trigger_id]
                if dtc.status == "active":
                    existing.append({
                        "id": trigger_id,
                        "code": dtc.code,
                        "severity": dtc.severity,
                        "detected_at": dtc.detected_at.isoformat(),
                    })
                twin.active_dtcs = existing
                flag_modified(twin, "active_dtcs")
                trigger_label = f"DTC {dtc.code}: {dtc.status}"

        elif trigger_type == "homologation":
            result = await db.execute(select(Homologation).where(Homologation.id == uuid.UUID(trigger_id)))
            hom = result.scalar_one_or_none()
            if hom:
                org_id = hom.organization_id
                new_hom = dict(twin.hom_status or {})
                new_hom[hom.regulation] = {
                    "status": hom.status,
                    "authority": hom.authority,
                    "next_action": hom.next_action_due.isoformat() if hom.next_action_due else None,
                }
                twin.hom_status = new_hom
                flag_modified(twin, "hom_status")
                trigger_label = f"HOM {hom.regulation}: {hom.status}"

        elif trigger_type == "obd":
            from app.models.obd_session import OBDSession
            result = await db.execute(select(OBDSession).where(OBDSession.id == uuid.UUID(trigger_id)))
            obd_session = result.scalar_one_or_none()
            if obd_session:
                org_id = obd_session.organization_id
                new_live = dict(obd_session.live_data or {})
                new_live["last_updated"] = datetime.now(timezone.utc).isoformat()
                new_live["session_id"] = trigger_id
                twin.obd_live_data = new_live
                flag_modified(twin, "obd_live_data")
                twin.last_obd_scan_at = datetime.now(timezone.utc)
                trigger_label = (
                    f"OBD sken: {obd_session.dtcs_imported} DTC uvoženih"
                    f", adapter {obd_session.adapter_type}"
                )

        elif trigger_type == "service":
            result = await db.execute(select(ServiceRecord).where(ServiceRecord.id == uuid.UUID(trigger_id)))
            sr = result.scalar_one_or_none()
            if sr:
                org_id = sr.organization_id
                twin.last_service_at = datetime.now(timezone.utc)
                trigger_label = f"Servis: {sr.service_type} ({sr.date})"

        twin.last_snapshot_at = datetime.now(timezone.utc)

        # Snapshot
        if org_id:
            snapshot = TwinSnapshot(
                vehicle_id=uuid.UUID(vehicle_id),
                organization_id=org_id,
                snapshot={
                    "ecu_config": twin.ecu_config,
                    "hom_status": twin.hom_status,
                    "active_dtcs": twin.active_dtcs,
                },
                trigger_type=trigger_type,
                trigger_id=uuid.UUID(trigger_id),
                trigger_label=trigger_label,
            )
            db.add(snapshot)

        await db.commit()

    await engine.dispose()
