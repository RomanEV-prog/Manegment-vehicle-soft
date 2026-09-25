"""
Konfiguracija vozila (R156 §7.1.2.2) — posnetki po VIN.

Posnetek vsebuje nameščene RXSWIN baseline-e (s programsko opremo in SHA-256
za vsak ECU) ter vgrajene ECU-je (serijska številka, HW verzija, batch).
Zapisi so nespremenljivi: 'initial_eol' enkrat na vozilo, nato 'last_known'
ob vsaki spremembi. Trenutna konfiguracija = najnovejši zapis.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.r156 import ECU, RXSWIN, RXSWINBaseline, RXSWINBaselineItem, VehicleConfiguration, VehicleECU
from app.models.vehicle import Vehicle

ITEM_KEYS = (
    "sw_version",
    "sw_file_name",
    "sw_file_sha256",
    "sw_config_version",
    "sw_config_file_name",
    "sw_config_sha256",
    "compatible_hardware",
)


async def current_configuration(db: AsyncSession, vehicle_id: uuid.UUID) -> VehicleConfiguration | None:
    return await db.scalar(
        select(VehicleConfiguration)
        .where(VehicleConfiguration.vehicle_id == vehicle_id)
        .order_by(VehicleConfiguration.created_at.desc(), VehicleConfiguration.id.desc())
        .limit(1)
    )


def installed_baselines(config: VehicleConfiguration | None) -> dict[str, str]:
    """{rxswin_id: baseline_id} iz posnetka."""
    if not config:
        return {}
    return {r["rxswin_id"]: r["baseline_id"] for r in config.snapshot.get("rxswins", [])}


async def build_snapshot(db: AsyncSession, vehicle: Vehicle, installed: dict[str, str]) -> dict:
    rxswins = []
    if installed:
        baselines = (
            (
                await db.execute(
                    select(RXSWINBaseline)
                    .where(RXSWINBaseline.id.in_([uuid.UUID(b) for b in installed.values()]))
                    .options(
                        selectinload(RXSWINBaseline.rxswin_ref),
                        selectinload(RXSWINBaseline.items).selectinload(RXSWINBaselineItem.ecu),
                    )
                )
            )
            .scalars()
            .all()
        )
        for b in sorted(baselines, key=lambda b: b.rxswin_ref.rxswin):
            rxswins.append(
                {
                    "rxswin_id": str(b.rxswin_id),
                    "rxswin": b.rxswin_ref.rxswin,
                    "baseline_id": str(b.id),
                    "baseline_number": b.baseline_number,
                    "items": [
                        {
                            "ecu": i.ecu.ecu_name,
                            "ecu_id": str(i.ecu_id),
                            "part_number": i.ecu.eversum_part_number,
                            **{k: getattr(i, k) for k in ITEM_KEYS},
                        }
                        for i in sorted(b.items, key=lambda i: i.ecu.ecu_name)
                    ],
                }
            )
    rows = (
        await db.execute(
            select(VehicleECU, ECU).join(ECU, ECU.id == VehicleECU.ecu_id).where(VehicleECU.vehicle_id == vehicle.id)
        )
    ).all()
    ecus = [
        {
            "ecu": e.ecu_name,
            "ecu_id": str(e.id),
            "part_number": e.eversum_part_number,
            "serial_number": ve.serial_number,
            "hardware_version": ve.hardware_version,
            "batch_number": ve.batch_number,
        }
        for ve, e in sorted(rows, key=lambda r: r[1].ecu_name)
    ]
    return {"vin": vehicle.vin, "rxswins": rxswins, "ecus": ecus}


async def record_configuration(
    db: AsyncSession,
    vehicle: Vehicle,
    *,
    config_type: str,
    installed: dict[str, str],
    reason: str,
    user_id: uuid.UUID | None,
    software_update_id: uuid.UUID | None = None,
    config_id: str | None = None,
    system_schemes_baseline: str | None = None,
    vv_status: str | None = None,
    erp_work_order: str | None = None,
) -> VehicleConfiguration:
    if config_id is None:
        n = await db.scalar(
            select(func.count()).select_from(VehicleConfiguration).where(VehicleConfiguration.vehicle_id == vehicle.id)
        )
        config_id = f"LKC-{vehicle.vin}-{n + 1:03d}"
    previous = await current_configuration(db, vehicle.id)
    cfg = VehicleConfiguration(
        organization_id=vehicle.organization_id,
        vehicle_id=vehicle.id,
        config_type=config_type,
        config_id=config_id,
        snapshot=await build_snapshot(db, vehicle, installed),
        system_schemes_baseline=system_schemes_baseline or (previous.system_schemes_baseline if previous else None),
        vv_status=vv_status,
        erp_work_order=erp_work_order or (previous.erp_work_order if previous else None),
        software_update_id=software_update_id,
        locked=True,
        reason=reason,
        created_by=user_id,
    )
    db.add(cfg)
    await db.flush()
    return cfg


async def rxswin_ids_for_type(db: AsyncSession, vehicle_type_id: uuid.UUID) -> set[uuid.UUID]:
    return set((await db.execute(select(RXSWIN.id).where(RXSWIN.vehicle_type_id == vehicle_type_id))).scalars())
