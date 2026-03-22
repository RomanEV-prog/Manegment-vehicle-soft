"""
Test infrastruktura — PostgreSQL test baza.
Za lokalni razvoj: docker-compose up db -d
Za CI: GitHub Actions PostgreSQL service container.
"""
import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app
from app.database import Base, get_db
from app.utils.security import hash_password, create_access_token

# Testna PostgreSQL baza — ločena od produkcijske
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://eversum:secret@localhost:5432/eversum_test",
)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    Session = async_sessionmaker(test_engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def org_and_user(db_session):
    """Ustvari testno organizacijo in admin uporabnika."""
    from app.models.organization import Organization
    from app.models.user import User

    org = Organization(name="Test eVersum", type="oem")
    db_session.add(org)
    await db_session.flush()

    admin = User(
        organization_id=org.id,
        email="test.admin@eversum.com",
        full_name="Test Admin",
        role="admin",
        password_hash=hash_password("test1234"),
    )
    qc = User(
        organization_id=org.id,
        email="test.qc@eversum.com",
        full_name="Test QC Manager",
        role="qc_manager",
        password_hash=hash_password("test1234"),
    )
    tech = User(
        organization_id=org.id,
        email="test.tech@eversum.com",
        full_name="Test Technician",
        role="technician",
        password_hash=hash_password("test1234"),
    )
    partner = User(
        organization_id=org.id,
        email="test.partner@eversum.com",
        full_name="Test Partner",
        role="partner_viewer",
        password_hash=hash_password("test1234"),
    )
    db_session.add_all([admin, qc, tech, partner])
    await db_session.commit()

    token = create_access_token({
        "sub": str(admin.id),
        "org_id": str(org.id),
        "role": admin.role,
    })

    def _tok(u):
        return create_access_token({"sub": str(u.id), "org_id": str(org.id), "role": u.role})

    return {
        "org": org,
        "admin": admin,
        "qc": qc,
        "tech": tech,
        "partner": partner,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
        "qc_headers": {"Authorization": f"Bearer {_tok(qc)}"},
        "tech_headers": {"Authorization": f"Bearer {_tok(tech)}"},
        "partner_headers": {"Authorization": f"Bearer {_tok(partner)}"},
    }


@pytest_asyncio.fixture
async def vehicle_with_twin(db_session, org_and_user):
    """Pripravi testno vozilo z digitalnim dvojnikom."""
    from app.models.vehicle import Vehicle
    from app.models.vehicle_twin import VehicleTwin

    vehicle = Vehicle(
        organization_id=org_and_user["org"].id,
        name="Test Harlander",
        model="e-Shuttle MK II-400",
        year=2024,
        vin=f"TEST-VIN-{__import__('uuid').uuid4().hex[:8].upper()}",
        project_name="Test Project",
    )
    db_session.add(vehicle)
    await db_session.flush()

    twin = VehicleTwin(vehicle_id=vehicle.id)
    db_session.add(twin)
    await db_session.commit()

    return {"vehicle": vehicle, "twin": twin}
