"""
Testi za DTC zapise — CRUD, batch resolve, audit log, org izolacija.
"""
from datetime import datetime, timezone
import pytest


@pytest.mark.asyncio
async def test_create_dtc_record(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    response = await client.post("/api/v1/dtc-records", json={
        "vehicle_id": str(vehicle.id),
        "code": "P0401",
        "description": "EGR Flow insufficient",
        "severity": "medium",
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "source": "manual",
    }, headers=org_and_user["headers"])
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == "P0401"
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_list_dtc_by_vehicle(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    # Ustvari 2 DTC
    for code in ["U0100", "B0001"]:
        await client.post("/api/v1/dtc-records", json={
            "vehicle_id": str(vehicle.id),
            "code": code,
            "description": f"Test napaka {code}",
            "severity": "low",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }, headers=org_and_user["headers"])

    response = await client.get(
        f"/api/v1/dtc-records?vehicle_id={vehicle.id}",
        headers=org_and_user["headers"],
    )
    assert response.status_code == 200
    codes = [d["code"] for d in response.json()]
    assert "U0100" in codes
    assert "B0001" in codes


@pytest.mark.asyncio
async def test_resolve_dtc(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]

    # Ustvari DTC
    create_resp = await client.post("/api/v1/dtc-records", json={
        "vehicle_id": str(vehicle.id),
        "code": "P0500",
        "description": "Vehicle Speed Sensor A",
        "severity": "high",
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }, headers=org_and_user["headers"])
    dtc_id = create_resp.json()["id"]

    # Reši DTC
    response = await client.put(f"/api/v1/dtc-records/{dtc_id}", json={
        "status": "resolved",
        "reason": "Zamenjana VSS komponenta",
    }, headers=org_and_user["headers"])
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "resolved"
    assert data["resolved_at"] is not None


@pytest.mark.asyncio
async def test_dtc_filter_by_severity(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]

    await client.post("/api/v1/dtc-records", json={
        "vehicle_id": str(vehicle.id),
        "code": "P0600",
        "description": "High severity test",
        "severity": "high",
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }, headers=org_and_user["headers"])

    response = await client.get(
        "/api/v1/dtc-records?severity=high",
        headers=org_and_user["headers"],
    )
    assert response.status_code == 200
    assert all(d["severity"] == "high" for d in response.json())


@pytest.mark.asyncio
async def test_delete_dtc(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/dtc-records", json={
        "vehicle_id": str(vehicle.id),
        "code": "P9999",
        "description": "Test za brisanje",
        "severity": "low",
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }, headers=org_and_user["headers"])
    dtc_id = create_resp.json()["id"]

    response = await client.delete(f"/api/v1/dtc-records/{dtc_id}", headers=org_and_user["headers"])
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_batch_resolve_dtc(client, org_and_user, vehicle_with_twin):
    """Batch resolve označi vse izbrane zapise kot resolved."""
    vehicle = vehicle_with_twin["vehicle"]
    ids = []
    for code in ["P1001", "P1002", "P1003"]:
        resp = await client.post("/api/v1/dtc-records", json={
            "vehicle_id": str(vehicle.id),
            "code": code,
            "description": f"Batch test {code}",
            "severity": "medium",
            "detected_at": datetime.now(timezone.utc).isoformat(),
            "source": "manual",
        }, headers=org_and_user["headers"])
        ids.append(resp.json()["id"])

    resp = await client.post(
        "/api/v1/dtc-records/batch-resolve",
        json={"ids": ids},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["resolved"] == 3

    # Preveri da so res resolved
    list_resp = await client.get(
        f"/api/v1/dtc-records?vehicle_id={vehicle.id}&status=resolved",
        headers=org_and_user["headers"],
    )
    resolved_ids = {d["id"] for d in list_resp.json()}
    assert all(i in resolved_ids for i in ids)


@pytest.mark.asyncio
async def test_batch_resolve_skips_already_resolved(client, org_and_user, vehicle_with_twin):
    """Batch resolve preskoči že rešene zapise, ne vrne napake."""
    vehicle = vehicle_with_twin["vehicle"]

    # Ustvari in takoj reši 1 DTC
    create = await client.post("/api/v1/dtc-records", json={
        "vehicle_id": str(vehicle.id),
        "code": "P2001",
        "description": "Že rešen",
        "severity": "low",
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }, headers=org_and_user["headers"])
    dtc_id = create.json()["id"]
    await client.put(f"/api/v1/dtc-records/{dtc_id}", json={"status": "resolved"}, headers=org_and_user["headers"])

    # Batch resolve na že rešenem → resolved=0
    resp = await client.post(
        "/api/v1/dtc-records/batch-resolve",
        json={"ids": [dtc_id]},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["resolved"] == 0


@pytest.mark.asyncio
async def test_batch_resolve_empty_list(client, org_and_user):
    """Prazen seznam vrne 400."""
    resp = await client.post(
        "/api/v1/dtc-records/batch-resolve",
        json={"ids": []},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_batch_resolve_audit_log(client, db_session, org_and_user, vehicle_with_twin):
    """Batch resolve zapiše audit log za vsak zapis."""
    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    vehicle = vehicle_with_twin["vehicle"]
    ids = []
    for code in ["P3001", "P3002"]:
        resp = await client.post("/api/v1/dtc-records", json={
            "vehicle_id": str(vehicle.id),
            "code": code,
            "description": f"Audit batch {code}",
            "severity": "high",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }, headers=org_and_user["headers"])
        ids.append(resp.json()["id"])

    await client.post(
        "/api/v1/dtc-records/batch-resolve",
        json={"ids": ids},
        headers=org_and_user["headers"],
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "dtc_record",
            AuditLog.action == "resolve",
        )
    )
    audit_ids = {str(log.entity_id) for log in result.scalars().all()}
    assert all(i in audit_ids for i in ids)


@pytest.mark.asyncio
async def test_dtc_not_visible_to_other_org(client, db_session, vehicle_with_twin, org_and_user):
    """DTC org A ni viden org B."""
    from app.models.organization import Organization
    from app.models.user import User
    from app.utils.security import hash_password, create_access_token

    org_b = Organization(name="Druga Org", type="partner")
    db_session.add(org_b)
    await db_session.flush()
    user_b = User(
        organization_id=org_b.id,
        email=f"user_b_{__import__('uuid').uuid4().hex[:6]}@test.com",
        full_name="User B",
        role="admin",
        password_hash=hash_password("pass"),
    )
    db_session.add(user_b)
    await db_session.commit()

    token_b = create_access_token({"sub": str(user_b.id), "org_id": str(org_b.id), "role": "admin"})

    response = await client.get(
        f"/api/v1/dtc-records?vehicle_id={vehicle_with_twin['vehicle'].id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    # Vrne prazen seznam ker vozilo pripada org A
    assert response.status_code == 200
    assert response.json() == []
