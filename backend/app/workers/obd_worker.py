"""
OBD worker — Celery task za asinhrono procesiranje OBD podatkov.
Trenutno se obd_scan endpoint zaključi sinhrono, ta worker pa
je namenjen za kasnejšo razširitev (polling adapter, scheduled scans).
"""
import asyncio

from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.obd_worker.process_obd_session", bind=True, max_retries=3)
def process_obd_session(self, session_id: str, vehicle_id: str):
    """
    Post-processing OBD seje (npr. korelacija z obstoječimi SW update-i).
    Kliče se po uspešnem skenu za dodatno analizo.
    """
    try:
        asyncio.run(_process_session(session_id, vehicle_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


async def _process_session(session_id: str, vehicle_id: str):
    """
    Primerja OBD ECU info z VehicleTwin.ecu_config in označi morebitna
    neskladja med SW verzijami v bazi in dejanskim stanjem vozila.
    """
    import uuid
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy import select

    from app.config import settings
    from app.models.obd_session import OBDSession
    from app.models.vehicle_twin import VehicleTwin

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        result = await db.execute(
            select(OBDSession).where(OBDSession.id == uuid.UUID(session_id))
        )
        session = result.scalar_one_or_none()
        if not session or not session.ecu_info:
            return

        twin_result = await db.execute(
            select(VehicleTwin).where(VehicleTwin.vehicle_id == uuid.UUID(vehicle_id))
        )
        twin = twin_result.scalar_one_or_none()
        if not twin:
            return

        # Primerjava ECU info iz OBD z zapisanimi verzijami v twin
        mismatches = {}
        for module, obd_info in session.ecu_info.items():
            twin_module = twin.ecu_config.get(module, {})
            twin_version = twin_module.get("version", "")
            if twin_version and twin_version not in str(obd_info):
                mismatches[module] = {
                    "twin_version": twin_version,
                    "obd_reported": obd_info,
                }

        if mismatches:
            # Zapiši neskladja nazaj v sejo (za analizo)
            from sqlalchemy.orm.attributes import flag_modified
            updated_live = dict(session.live_data or {})
            updated_live["ecu_mismatches"] = mismatches
            session.live_data = updated_live
            flag_modified(session, "live_data")
            await db.commit()

    await engine.dispose()
