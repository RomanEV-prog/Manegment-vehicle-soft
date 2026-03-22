"""
Testi za servisne zapise — CRUD, delete, audit log, org izolacija.
"""
from datetime import date
import pytest


@pytest.mark.asyncio
async def test_create_service_record(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    response = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "maintenance",
        "items": ["Menjava olja", "Oljni filter", "Pregled zavor"],
        "technician": "Roman Adler",
        "notes": "Redno vzdrževanje",
    }, headers=org_and_user["headers"])
    assert response.status_code == 201
    data = response.json()
    assert data["service_type"] == "maintenance"
    assert "Menjava olja" in data["items"]


@pytest.mark.asyncio
async def test_list_service_records_by_vehicle(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]

    # Ustvari 2 servisa
    for service_type in ["brakes", "tyres"]:
        await client.post("/api/v1/service-records", json={
            "vehicle_id": str(vehicle.id),
            "date": date.today().isoformat(),
            "service_type": service_type,
            "items": [f"Test {service_type}"],
            "technician": "Testni tehnik",
        }, headers=org_and_user["headers"])

    response = await client.get(
        f"/api/v1/service-records?vehicle_id={vehicle.id}",
        headers=org_and_user["headers"],
    )
    assert response.status_code == 200
    types = [r["service_type"] for r in response.json()]
    assert "brakes" in types
    assert "tyres" in types


@pytest.mark.asyncio
async def test_update_service_record(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "electrical",
        "items": ["Pregled kabelske napeljave"],
        "technician": "Roman Adler",
    }, headers=org_and_user["headers"])
    record_id = create_resp.json()["id"]

    response = await client.put(f"/api/v1/service-records/{record_id}", json={
        "notes": "Najdena napaka v konektorju X12 — zamenjana",
    }, headers=org_and_user["headers"])
    assert response.status_code == 200
    assert "konektorju" in response.json()["notes"]


@pytest.mark.asyncio
async def test_service_record_wrong_vehicle(client, org_and_user):
    """Servisa ni mogoče ustvariti za neobstoječe vozilo."""
    import uuid
    response = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(uuid.uuid4()),
        "date": date.today().isoformat(),
        "service_type": "maintenance",
        "items": ["Test"],
        "technician": "Test",
    }, headers=org_and_user["headers"])
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_service_record(client, org_and_user, vehicle_with_twin):
    """DELETE izbriše servisni zapis — 204, nato 404."""
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "other",
        "items": ["Test brisanje"],
        "technician": "Brisalec Test",
    }, headers=org_and_user["headers"])
    assert create_resp.status_code == 201
    record_id = create_resp.json()["id"]

    del_resp = await client.delete(
        f"/api/v1/service-records/{record_id}",
        headers=org_and_user["headers"],
    )
    assert del_resp.status_code == 204

    get_resp = await client.get(
        f"/api/v1/service-records/{record_id}",
        headers=org_and_user["headers"],
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_service_record_audit_on_create(client, db_session, org_and_user, vehicle_with_twin):
    """create zapiše audit log z entity_type=service_record."""
    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    vehicle = vehicle_with_twin["vehicle"]
    resp = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "battery",
        "items": ["Pregled baterije"],
        "technician": "Roman",
    }, headers=org_and_user["headers"])
    assert resp.status_code == 201
    record_id = resp.json()["id"]

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "service_record",
            AuditLog.action == "create",
        )
    )
    logs = result.scalars().all()
    assert any(str(log.entity_id) == record_id for log in logs)


@pytest.mark.asyncio
async def test_service_record_audit_on_update(client, db_session, org_and_user, vehicle_with_twin):
    """update zapiše audit log z before/after."""
    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "inspection",
        "items": ["Pregled"],
        "technician": "Pred",
    }, headers=org_and_user["headers"])
    record_id = create_resp.json()["id"]

    await client.put(f"/api/v1/service-records/{record_id}", json={
        "technician": "Po",
    }, headers=org_and_user["headers"])

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "service_record",
            AuditLog.action == "update",
        )
    )
    logs = result.scalars().all()
    log = next((l for l in logs if str(l.entity_id) == record_id), None)
    assert log is not None
    assert log.before["technician"] == "Pred"
    assert log.after["technician"] == "Po"


@pytest.mark.asyncio
async def test_service_record_audit_on_delete(client, db_session, org_and_user, vehicle_with_twin):
    """delete zapiše audit log z action=delete."""
    from app.models.audit_log import AuditLog
    from sqlalchemy import select

    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "software",
        "items": ["SW pregled"],
        "technician": "Del Tehnik",
    }, headers=org_and_user["headers"])
    record_id = create_resp.json()["id"]

    await client.delete(
        f"/api/v1/service-records/{record_id}",
        headers=org_and_user["headers"],
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "service_record",
            AuditLog.action == "delete",
        )
    )
    logs = result.scalars().all()
    assert any(str(log.entity_id) == record_id for log in logs)


@pytest.mark.asyncio
async def test_service_record_not_deletable_by_other_org(client, db_session, org_and_user, vehicle_with_twin):
    """Brisanje zapisa druge organizacije vrne 404."""
    from app.models.organization import Organization
    from app.models.user import User
    from app.utils.security import hash_password, create_access_token
    import uuid

    # Ustvari zapis za org A
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": date.today().isoformat(),
        "service_type": "brakes",
        "items": ["Zavore"],
        "technician": "Org A tehnik",
    }, headers=org_and_user["headers"])
    record_id = create_resp.json()["id"]

    # Org B poskuša izbrisati
    org_b = Organization(name="Vsiljivec", type="partner")
    db_session.add(org_b)
    await db_session.flush()
    user_b = User(
        organization_id=org_b.id,
        email=f"intruder_{uuid.uuid4().hex[:6]}@x.com",
        full_name="Intruder",
        role="admin",
        password_hash=hash_password("pass"),
    )
    db_session.add(user_b)
    await db_session.commit()
    token_b = create_access_token({"sub": str(user_b.id), "org_id": str(org_b.id), "role": "admin"})

    resp = await client.delete(
        f"/api/v1/service-records/{record_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404
