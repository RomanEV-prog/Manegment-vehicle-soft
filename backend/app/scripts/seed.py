"""
Seed script — ustvari testne podatke za lokalni razvoj.
Zaženi: docker-compose exec api python -m app.scripts.seed
"""
import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.organization import Organization
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_twin import VehicleTwin
from app.utils.security import hash_password


async def seed():
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # eVersum organizacija
        eversum = Organization(name="eVersum", type="oem")
        db.add(eversum)
        await db.flush()

        # Partnerji
        arrriva = Organization(name="Arriva Koper", type="partner")
        imagry = Organization(name="Imagry / Toyota", type="partner")
        db.add(arrriva)
        db.add(imagry)
        await db.flush()

        # Admin uporabnik
        admin = User(
            organization_id=eversum.id,
            email="h.postl@eversum.com",
            full_name="Holger Postl",
            role="admin",
            password_hash=hash_password("admin1234"),
        )
        db.add(admin)

        # QC Manager
        marko = User(
            organization_id=eversum.id,
            email="m.hrelja@eversum.com",
            full_name="Marko Hrelja",
            role="qc_manager",
            password_hash=hash_password("admin1234"),
        )
        db.add(marko)

        # Tehniki
        roman = User(
            organization_id=eversum.id,
            email="r.adler@eversum.com",
            full_name="Roman Adler",
            role="technician",
            password_hash=hash_password("admin1234"),
        )
        db.add(roman)
        await db.flush()

        # Vozila
        vehicles_data = [
            {"name": "Harlander #1", "model": "e-Shuttle MK II-400", "year": 2024,
             "vin": "WEV1234567890001", "project_name": "Imagry Japan", "status": "active"},
            {"name": "Harlander #2", "model": "e-Shuttle MK II-400", "year": 2024,
             "vin": "WEV1234567890002", "project_name": "Navya France", "status": "active"},
            {"name": "eShuttle Prototip #1", "model": "e-Shuttle MK II", "year": 2023,
             "vin": "WEV1234567890003", "project_name": "Arriva Koper", "status": "in_service", "seats": 22},
            {"name": "eShuttle Prototip #2", "model": "e-Shuttle MK II", "year": 2023,
             "vin": "WEV1234567890004", "project_name": "Arriva Koper", "status": "active", "seats": 22},
        ]

        for vdata in vehicles_data:
            vehicle = Vehicle(organization_id=eversum.id, **vdata)
            db.add(vehicle)
            await db.flush()
            twin = VehicleTwin(vehicle_id=vehicle.id)
            db.add(twin)

        await db.commit()

    await engine.dispose()
    print("✓ Seed podatki uspešno ustvarjeni!")
    print("  Login: h.postl@eversum.com / admin1234")
    print("  Login: m.hrelja@eversum.com / admin1234")
    print("  Login: r.adler@eversum.com / admin1234")


if __name__ == "__main__":
    asyncio.run(seed())
