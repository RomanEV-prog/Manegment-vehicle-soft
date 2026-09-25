"""
Testi za SW posodobitve — RXSWIN validacija, CRUD, status machine, audit log.
"""
import pytest
from datetime import date


# ─── Helper ───────────────────────────────────────────────────────────────────

def sw_payload(vehicle_id: str, **kwargs) -> dict:
    defaults = {
        "vehicle_id": vehicle_id,
        "date": str(date.today()),
        "ecu_module": "Motor ECU",
        "version_before": "2.1.0",
        "version_after": "2.2.1",
        "rxswin": "RXSWIN-EV-M1-221",
        "method": "OTA",
        "status": "pending",
    }
    defaults.update(kwargs)
    return defaults


# ─── RXSWIN validacija ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rxswin_invalid_format(client, org_and_user, vehicle_with_twin):
    """RXSWIN z napačnim formatom vrne 422."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    resp = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, rxswin="napacen-format"),
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_rxswin_required(client, org_and_user, db_session):
    """Legacijski test — RXSWIN napačen format → 422."""
    from app.models.vehicle import Vehicle
    from app.models.vehicle_twin import VehicleTwin

    vehicle = Vehicle(
        organization_id=org_and_user["org"].id,
        name="Test Vozilo",
        model="e-Shuttle",
        year=2024,
        vin="VIN-TEST-SW-001",
    )
    db_session.add(vehicle)
    await db_session.flush()
    twin = VehicleTwin(vehicle_id=vehicle.id)
    db_session.add(twin)
    await db_session.commit()

    response = await client.post("/api/v1/sw-updates", json={
        "vehicle_id": str(vehicle.id),
        "date": "2026-03-17",
        "ecu_module": "Motor ECU",
        "version_before": "2.1.0",
        "version_after": "2.2.1",
        "rxswin": "napacen-format",
        "method": "OTA",
        "status": "success",
    }, headers=org_and_user["headers"])
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_sw_update_valid(client, org_and_user, db_session):
    """Veljavna SW posodobitev s pravilnim RXSWIN."""
    from app.models.vehicle import Vehicle
    from app.models.vehicle_twin import VehicleTwin

    vehicle = Vehicle(
        organization_id=org_and_user["org"].id,
        name="Test Vozilo 2",
        model="e-Shuttle",
        year=2024,
        vin="VIN-TEST-SW-002",
    )
    db_session.add(vehicle)
    await db_session.flush()
    twin = VehicleTwin(vehicle_id=vehicle.id)
    db_session.add(twin)
    await db_session.commit()

    response = await client.post("/api/v1/sw-updates", json={
        "vehicle_id": str(vehicle.id),
        "date": "2026-03-17",
        "ecu_module": "Motor ECU",
        "version_before": "2.1.0",
        "version_after": "2.2.1",
        "rxswin": "RXSWIN-EV-M1-221",
        "method": "OTA",
        "status": "success",
    }, headers=org_and_user["headers"])
    assert response.status_code == 201
    data = response.json()
    assert data["rxswin"] == "RXSWIN-EV-M1-221"
    assert data["version_after"] == "2.2.1"


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_sw_updates(client, org_and_user, vehicle_with_twin):
    """Seznam SW posodobitev za organizacijo."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id),
        headers=org_and_user["headers"],
    )

    resp = await client.get("/api/v1/sw-updates", headers=org_and_user["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert all(r["organization_id"] == str(org_and_user["org"].id) for r in data)


@pytest.mark.asyncio
async def test_list_sw_updates_filter_by_vehicle(client, org_and_user, vehicle_with_twin):
    """Filter po vehicle_id."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, ecu_module="BMS ECU"),
        headers=org_and_user["headers"],
    )

    resp = await client.get(
        f"/api/v1/sw-updates?vehicle_id={vehicle_id}",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert all(r["vehicle_id"] == vehicle_id for r in resp.json())


@pytest.mark.asyncio
async def test_list_sw_updates_filter_by_status(client, org_and_user, vehicle_with_twin):
    """Filter po statusu."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, status="success"),
        headers=org_and_user["headers"],
    )
    await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, status="pending", ecu_module="OBD ECU"),
        headers=org_and_user["headers"],
    )

    resp = await client.get(
        "/api/v1/sw-updates?status=success",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert all(r["status"] == "success" for r in resp.json())


@pytest.mark.asyncio
async def test_sw_update_wrong_vehicle(client, org_and_user):
    """Neobstoječe vozilo → 404."""
    import uuid
    resp = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(str(uuid.uuid4())),
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 404


# ─── Status machine ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sw_status_pending_to_in_progress(client, org_and_user, vehicle_with_twin):
    """pending → in_progress."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, status="pending"),
        headers=org_and_user["headers"],
    )
    sw_id = create.json()["id"]

    resp = await client.put(
        f"/api/v1/sw-updates/{sw_id}",
        json={"status": "in_progress"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_sw_status_in_progress_to_success(client, org_and_user, vehicle_with_twin):
    """in_progress → success."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, status="in_progress"),
        headers=org_and_user["headers"],
    )
    sw_id = create.json()["id"]

    resp = await client.put(
        f"/api/v1/sw-updates/{sw_id}",
        json={"status": "success"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"


@pytest.mark.asyncio
async def test_sw_status_failed_to_rolled_back(client, org_and_user, vehicle_with_twin):
    """failed → rolled_back."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, status="failed"),
        headers=org_and_user["headers"],
    )
    sw_id = create.json()["id"]

    resp = await client.put(
        f"/api/v1/sw-updates/{sw_id}",
        json={"status": "rolled_back"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rolled_back"


@pytest.mark.asyncio
async def test_sw_status_invalid(client, org_and_user, vehicle_with_twin):
    """Neveljaven status vrne 422."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id),
        headers=org_and_user["headers"],
    )
    sw_id = create.json()["id"]

    resp = await client.put(
        f"/api/v1/sw-updates/{sw_id}",
        json={"status": "neveljaven_status"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sw_update_notes(client, org_and_user, vehicle_with_twin):
    """Posodobitev opomb brez spremembe statusa."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id),
        headers=org_and_user["headers"],
    )
    sw_id = create.json()["id"]

    resp = await client.put(
        f"/api/v1/sw-updates/{sw_id}",
        json={"notes": "Posodobitev uspešna — brez težav"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "Posodobitev uspešna — brez težav"


# ─── Audit log ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sw_create_writes_audit_log(client, db_session, org_and_user, vehicle_with_twin):
    """Ustvarjanje SW posodobitve zapiše audit log."""
    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id),
        headers=org_and_user["headers"],
    )
    assert create.status_code == 201
    sw_id = create.json()["id"]

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "sw_update",
            AuditLog.action == "create",
        )
    )
    logs = result.scalars().all()
    assert any(str(log.entity_id) == sw_id for log in logs)


@pytest.mark.asyncio
async def test_sw_update_writes_audit_log_with_before_after(client, db_session, org_and_user, vehicle_with_twin):
    """Posodobitev statusa zapiše before/after v audit log."""
    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    create = await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id, status="pending"),
        headers=org_and_user["headers"],
    )
    sw_id = create.json()["id"]

    await client.put(
        f"/api/v1/sw-updates/{sw_id}",
        json={"status": "in_progress"},
        headers=org_and_user["headers"],
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "sw_update",
            AuditLog.action == "update",
        )
    )
    logs = result.scalars().all()
    log = next((l for l in logs if str(l.entity_id) == sw_id), None)
    assert log is not None
    assert log.before["status"] == "pending"
    assert log.after["status"] == "in_progress"


# ─── Org izolacija ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sw_update_org_isolation(client, db_session, org_and_user, vehicle_with_twin):
    """SW posodobitev org A ni vidna org B."""
    from app.models.organization import Organization
    from app.models.user import User
    from app.utils.security import hash_password, create_access_token
    import uuid

    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    await client.post(
        "/api/v1/sw-updates",
        json=sw_payload(vehicle_id),
        headers=org_and_user["headers"],
    )

    org_b = Organization(name="Org B SW", type="tier1")
    db_session.add(org_b)
    await db_session.flush()
    user_b = User(
        organization_id=org_b.id,
        email=f"orgb_{uuid.uuid4().hex[:6]}@sw.com",
        full_name="Org B User",
        role="admin",
        password_hash=hash_password("pass"),
    )
    db_session.add(user_b)
    await db_session.commit()

    token_b = create_access_token({"sub": str(user_b.id), "org_id": str(org_b.id), "role": "admin"})
    resp = await client.get(
        "/api/v1/sw-updates",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []
