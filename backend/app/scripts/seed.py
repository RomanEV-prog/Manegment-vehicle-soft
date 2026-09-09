"""
Seed script — ustvari testne podatke za lokalni razvoj.
Zaženi: docker compose exec api python -m app.scripts.seed

Skripta je idempotentna: obstoječih zapisov ne podvaja in ne prepisuje.
Ključi za prepoznavo — organizacija po imenu, uporabnik po e-pošti, vozilo po VIN.
"""
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.organization import Organization
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_twin import VehicleTwin
from app.utils.security import hash_password


async def get_or_create(db: AsyncSession, model, match: dict, defaults: dict | None = None):
    """Vrne (zapis, ustvarjen_na_novo). Obstoječega ne spreminja."""
    stmt = select(model).filter_by(**match)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing, False
    obj = model(**match, **(defaults or {}))
    db.add(obj)
    await db.flush()
    return obj, True


ORGANIZATIONS = [
    {"name": "eVersum", "type": "oem"},
    {"name": "Arriva Koper", "type": "partner"},
    {"name": "Imagry / Toyota", "type": "partner"},
]

USERS = [
    {"email": "h.postl@eversum.com", "full_name": "Holger Postl", "role": "admin"},
    {"email": "m.hrelja@eversum.com", "full_name": "Marko Hrelja", "role": "qc_manager"},
    {"email": "r.adler@eversum.com", "full_name": "Roman Adler", "role": "technician"},
]

VEHICLES = [
    {"name": "Harlander #1", "model": "e-Shuttle MK II-400", "year": 2024,
     "vin": "WEV1234567890001", "project_name": "Imagry Japan", "status": "active"},
    {"name": "Harlander #2", "model": "e-Shuttle MK II-400", "year": 2024,
     "vin": "WEV1234567890002", "project_name": "Navya France", "status": "active"},
    {"name": "eShuttle Prototip #1", "model": "e-Shuttle MK II", "year": 2023,
     "vin": "WEV1234567890003", "project_name": "Arriva Koper", "status": "in_service", "seats": 22},
    {"name": "eShuttle Prototip #2", "model": "e-Shuttle MK II", "year": 2023,
     "vin": "WEV1234567890004", "project_name": "Arriva Koper", "status": "active", "seats": 22},
]


async def seed():
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    created = {"organizations": 0, "users": 0, "vehicles": 0, "vehicle_twins": 0}

    async with Session() as db:
        orgs = {}
        for data in ORGANIZATIONS:
            org, is_new = await get_or_create(
                db, Organization, {"name": data["name"]}, {"type": data["type"]}
            )
            orgs[data["name"]] = org
            created["organizations"] += is_new

        eversum = orgs["eVersum"]

        for data in USERS:
            _, is_new = await get_or_create(
                db, User, {"email": data["email"]},
                {
                    "organization_id": eversum.id,
                    "full_name": data["full_name"],
                    "role": data["role"],
                    "password_hash": hash_password("admin1234"),
                },
            )
            created["users"] += is_new

        for data in VEHICLES:
            vdata = dict(data)
            vin = vdata.pop("vin")
            vehicle, is_new = await get_or_create(
                db, Vehicle, {"vin": vin}, {"organization_id": eversum.id, **vdata}
            )
            created["vehicles"] += is_new

            _, twin_is_new = await get_or_create(
                db, VehicleTwin, {"vehicle_id": vehicle.id}
            )
            created["vehicle_twins"] += twin_is_new

        await db.commit()

    await engine.dispose()

    print("✓ Seed končan.")
    for table, count in created.items():
        print(f"  {table}: {count} novih")
    print("  Login: h.postl@eversum.com / admin1234")
    print("  Login: m.hrelja@eversum.com / admin1234")
    print("  Login: r.adler@eversum.com / admin1234")


if __name__ == "__main__":
    asyncio.run(seed())
