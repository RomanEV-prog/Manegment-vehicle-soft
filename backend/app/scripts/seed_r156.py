"""
Vnos podatkov iz gradiva Jakuba Zduna (mejl 8. 9. 2026).

Viri, iz katerih so podatki prepisani dobesedno:
  - 'R156 SUMS Overview.drawio', list 'Example'  -> RXSWIN R48SWIN001, ECU-ji BCU/MUX1/MUX2
  - 'VCU ES03v02_vcu1_1_2_115 Readme - 10_17_2025 8_16_43 am.pdf' -> VCU, prava SHA-256

OPOZORILO: kontrolne vsote in Egnyte povezave iz diagrama so v izvirniku okrajšane
(npr. 'd7f66a732e4b1f..', 'https://evision.egnyte..') in NISO prave vrednosti.
Zapisani so dobesedno in označeni v opombi, da jih ne bi kdo zamenjal za dokaz
integritete. Edina prava SHA-256 v tem naboru je VCU iz readme PDF.

Zaženi: docker compose exec api python -m app.scripts.seed_r156
Skripta je idempotentna.
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.organization import Organization
from app.models.r156 import (
    ECU,
    RXSWIN,
    RXSWINBaseline,
    RXSWINBaselineItem,
    VehicleType,
)

# Besedilo vidi naročnik v aplikaciji, zato je v angleščini
PLACEHOLDER_NOTE = (
    "Values transcribed from 'R156 SUMS Overview.drawio' (sheet 'Example'), where they are "
    "truncated with '..' — NOT real checksums."
)

VEHICLE_TYPE = {
    "name": "e-Shuttle MK II-400",
    "model_code": "ES03",
    "description": "Vehicle type from the R156 SUMS Overview reference material (example R48SWIN001).",
}

# ECU katalog — polja točno kot v diagramu
ECUS = [
    {
        "ecu_name": "Body Control Unit",
        "system_name": "Exterior Lighting",
        "supplier": "Continental",
        "eversum_part_number": "EV-00002-37716",
        "un_ece_reg_number": "UN-ECE Reg 48",
    },
    {
        "ecu_name": "MUX1",
        "system_name": "Exterior Lighting",
        "supplier": "Continental",
        "eversum_part_number": "EV-00000-40775",
        "un_ece_reg_number": "UN-ECE Reg 48",
    },
    {
        "ecu_name": "MUX2",
        "system_name": "Exterior Lighting",
        "supplier": "Continental",
        "eversum_part_number": "EV-00000-40775",
        "un_ece_reg_number": "UN-ECE Reg 48",
    },
    {
        "ecu_name": "Vehicle Control Unit",
        "system_name": "Vehicle Control",
        "supplier": "eVersum",
        "eversum_part_number": "EV-00000-41817",
        "un_ece_reg_number": None,
        "description": "Vehicle Control Unit (source: Helix ALM readme VCU ES03v02_vcu1_1_2_115).",
    },
]

# Baseline 1 za R48SWIN001 — vrednosti iz lista 'Example'
R48_ITEMS = [
    {
        "ecu_name": "Body Control Unit",
        "sw_version": "v.2.0",
        "sw_file_sha256": "d7f66a732e4b1f..",
        "sw_config_version": "v.1.1",
        "sw_config_sha256": "e9bc3000a16aa29..",
        "egnyte_folder_url": "https://evision.egnyte..",
        "compatible_hardware": "v.1.3",
        "description": PLACEHOLDER_NOTE,
    },
    {
        "ecu_name": "MUX1",
        "sw_version": "v.3.0",
        "sw_file_sha256": "h56hd9k8ff3vf..",
        "sw_config_version": "v.2.1",
        "sw_config_sha256": "p9y3fcc25bf78f..",
        "egnyte_folder_url": "https://evision.egnyte..",
        "compatible_hardware": "v.1.5",
        "description": PLACEHOLDER_NOTE,
    },
    {
        "ecu_name": "MUX2",
        "sw_version": "v.3.0",
        "sw_file_sha256": "g45d8sdncsg7h2..",
        "sw_config_version": "v.2.1",
        "sw_config_sha256": "x4a22o0o8gdv6d..",
        "egnyte_folder_url": "https://evision.egnyte..",
        "compatible_hardware": "v.1.5",
        "description": PLACEHOLDER_NOTE,
    },
]

# VCU — edini zapis s pravo SHA-256, iz priloženega readme PDF
VCU_CHANGE_LOG = """* APP VERSION 1.2.115 -
* [charge_dc] IntLim_IDC_DFLT change (150A) reverted to 200A
* [ptcm] ActRecupTqCorr intoduced (but not used) to correct the difference between the requested and actually executed from the motor recuperation torque
* [ptcm] The speed limit send from ptcm to PtActrCoorr is changed to VEC_Vkph_MAX (100kph) in order not to set it higher than the motor maximum speed.
* So it is not intended to be used as vehicle speed limiter.
* [PtActrCoorr] In consistency with above, the MotSpeed limit is set to the motor specified limit
* [ptcm] Get_SpeedLimtierDrtFactor() Introduced and used to limit the driver torque request to limit the maximum vehicle speed set with VEC_Vkph_LIMIT
* [PtActrCoorr] The source for the PtOutSpd signal is changed from motor controller to the transmission output shaft speed, because the original signal is incorrect during shifting"""

VCU_ITEM = {
    "ecu_name": "Vehicle Control Unit",
    "sw_version": "ES03v02_vcu1_1_2_115",
    "sw_file_name": "ES03v02_vcu1_1_2_115.hex",
    "sw_file_sha256": "1a3997c70c0f43f172086e41854262b83d4a7cadf45e08833bd1f066684df9e5",
    "sw_config_version": None,
    "sw_config_file_name": None,
    "sw_config_sha256": None,
    "compatible_hardware": "927889/TTC-500",
    "change_log": VCU_CHANGE_LOG,
    "description": "Vehicle Control Unit software. Source: Helix ALM readme, baseline 152, 17 Oct 2025.",
}

# Serijske številke instanc ECU iz diagrama — vežemo jih na vozilo, če obstaja
VEHICLE_ECU_INSTANCES = {
    "Body Control Unit": {"serial_number": "N6200012501301", "hardware_version": "v.1.3", "batch_number": "7009"},
    "MUX1": {"serial_number": "N6530012501443", "hardware_version": "v.1.5", "batch_number": "6554"},
    "MUX2": {"serial_number": "N6530012502233", "hardware_version": "v.1.5", "batch_number": "6554"},
}


async def get_or_create(db: AsyncSession, model, match: dict, defaults: dict | None = None):
    existing = (await db.execute(select(model).filter_by(**match))).scalar_one_or_none()
    if existing is not None:
        return existing, False
    obj = model(**match, **(defaults or {}))
    db.add(obj)
    await db.flush()
    return obj, True


async def release(db: AsyncSession, baseline: RXSWINBaseline) -> None:
    """Izda baseline po vnosu postavk (ob ponovnem zagonu je že izdan)."""
    if baseline.status == "draft":
        baseline.status = "released"
        baseline.released_at = datetime.now(timezone.utc)
        await db.flush()


async def seed_r156() -> None:
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    created = {"vehicle_types": 0, "ecus": 0, "rxswins": 0, "baselines": 0, "baseline_items": 0}

    async with Session() as db:
        org = (await db.execute(select(Organization).where(Organization.name == "eVersum"))).scalar_one_or_none()
        if org is None:
            raise SystemExit("Organizacija 'eVersum' ne obstaja — najprej poženi app.scripts.seed")

        vtype, is_new = await get_or_create(
            db,
            VehicleType,
            {"organization_id": org.id, "name": VEHICLE_TYPE["name"]},
            {"model_code": VEHICLE_TYPE["model_code"], "description": VEHICLE_TYPE["description"]},
        )
        created["vehicle_types"] += is_new

        ecus: dict[str, ECU] = {}
        for data in ECUS:
            payload = dict(data)
            name = payload.pop("ecu_name")
            ecu, is_new = await get_or_create(
                db,
                ECU,
                {"vehicle_type_id": vtype.id, "ecu_name": name},
                {"organization_id": org.id, **payload},
            )
            ecus[name] = ecu
            created["ecus"] += is_new

        # --- RXSWIN R48SWIN001, baseline 1 (izdan) ---
        rxswin, is_new = await get_or_create(
            db,
            RXSWIN,
            {"organization_id": org.id, "rxswin": "R48SWIN001"},
            {
                "vehicle_type_id": vtype.id,
                "description": "Exterior Lighting — software relevant to UN-ECE Reg 48.",
                "regulations_affected": ["UN-ECE R48"],
                "status": "active",
            },
        )
        created["rxswins"] += is_new

        baseline, is_new = await get_or_create(
            db,
            RXSWINBaseline,
            {"rxswin_id": rxswin.id, "baseline_number": 1},
            {
                "organization_id": org.id,
                "status": "draft",  # postavke se lahko dodajo le v draft (trigger)
                "integrity_method": "SHA-256",
                "notes": "Transcribed from 'R156 SUMS Overview.drawio', sheet 'Example'. "
                "Checksums are truncated in the source and are NOT real values.",
            },
        )
        created["baselines"] += is_new

        for item in R48_ITEMS:
            payload = dict(item)
            ecu = ecus[payload.pop("ecu_name")]
            _, is_new = await get_or_create(
                db,
                RXSWINBaselineItem,
                {"baseline_id": baseline.id, "ecu_id": ecu.id},
                payload,
            )
            created["baseline_items"] += is_new
        await release(db, baseline)

        # --- VCU: lastni RXSWIN, ker readme ne navaja pripadnosti R48 ---
        vcu_rxswin, is_new = await get_or_create(
            db,
            RXSWIN,
            {"organization_id": org.id, "rxswin": "VCUSWIN001"},
            {
                "vehicle_type_id": vtype.id,
                "description": "Vehicle Control Unit software (Helix ALM readme). PROVISIONAL RXSWIN — "
                "the regulation / RXSWIN assignment is not stated in the source and is to be confirmed.",
                "status": "active",
            },
        )
        created["rxswins"] += is_new

        vcu_baseline, is_new = await get_or_create(
            db,
            RXSWINBaseline,
            {"rxswin_id": vcu_rxswin.id, "baseline_number": 1},
            {
                "organization_id": org.id,
                "status": "draft",  # postavke se lahko dodajo le v draft (trigger)
                "integrity_method": "SHA-256",
                "notes": "Source: 'VCU ES03v02_vcu1_1_2_115 Readme', Helix ALM baseline 152, 17 Oct 2025.",
            },
        )
        created["baselines"] += is_new

        payload = dict(VCU_ITEM)
        ecu = ecus[payload.pop("ecu_name")]
        _, is_new = await get_or_create(
            db,
            RXSWINBaselineItem,
            {"baseline_id": vcu_baseline.id, "ecu_id": ecu.id},
            payload,
        )
        created["baseline_items"] += is_new
        await release(db, vcu_baseline)

        await db.commit()

    await engine.dispose()

    print("✓ R156 podatki iz gradiva Jakuba Zduna vneseni.")
    for table, count in created.items():
        print(f"  {table}: {count} novih")
    print("\n  Opozorilo: kontrolne vsote za BCU/MUX1/MUX2 so iz diagrama okrajšane ('..')")
    print("  in niso prave. Prava SHA-256 je samo pri VCU (iz readme PDF).")


if __name__ == "__main__":
    asyncio.run(seed_r156())
