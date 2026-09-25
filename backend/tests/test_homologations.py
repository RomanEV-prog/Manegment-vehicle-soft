from datetime import date, timedelta
import pytest


@pytest.mark.asyncio
async def test_create_homologation(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    response = await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "UNECE_R156",
        "status": "in_progress",
        "authority": "TÜV",
        "country": "DE",
        "next_action_due": (date.today() + timedelta(days=30)).isoformat(),
    }, headers=org_and_user["headers"])
    assert response.status_code == 201
    data = response.json()
    assert data["regulation"] == "UNECE_R156"
    assert data["status"] == "in_progress"


@pytest.mark.asyncio
async def test_update_homologation_status(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "ECE_R100",
        "status": "open",
    }, headers=org_and_user["headers"])
    hom_id = create_resp.json()["id"]

    # Preidi na compliant
    response = await client.put(f"/api/v1/homologations/{hom_id}", json={
        "status": "compliant",
        "valid_from": date.today().isoformat(),
        "valid_until": (date.today() + timedelta(days=365)).isoformat(),
        "authority": "MV",
    }, headers=org_and_user["headers"])
    assert response.status_code == 200
    assert response.json()["status"] == "compliant"


@pytest.mark.asyncio
async def test_list_open_homologations(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "ECE_R79",
        "status": "open",
    }, headers=org_and_user["headers"])

    response = await client.get(
        "/api/v1/homologations?status=open",
        headers=org_and_user["headers"],
    )
    assert response.status_code == 200
    assert all(h["status"] == "open" for h in response.json())


@pytest.mark.asyncio
async def test_coc_certificate_create(client, org_and_user, vehicle_with_twin):
    vehicle = vehicle_with_twin["vehicle"]
    response = await client.post("/api/v1/coc-certificates", json={
        "vehicle_id": str(vehicle.id),
        "coc_number": "CoC-2026-001",
        "issued_at": date.today().isoformat(),
        "issuing_body": "TÜV SÜD",
    }, headers=org_and_user["headers"])
    assert response.status_code == 201
    assert response.json()["coc_number"] == "CoC-2026-001"


@pytest.mark.asyncio
async def test_unique_regulation_per_vehicle(client, org_and_user, vehicle_with_twin, db_session):
    """Ista uredba ne sme biti dvakrat za isto vozilo."""
    vehicle = vehicle_with_twin["vehicle"]
    reg = "UNECE_R155_UNIQUE_TEST"

    resp1 = await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": reg,
        "status": "open",
    }, headers=org_and_user["headers"])
    assert resp1.status_code == 201

    # Drugi vnos iste uredbe za isto vozilo mora vrniti napako
    resp2 = await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": reg,
        "status": "in_progress",
    }, headers=org_and_user["headers"])
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_homologation_audit_on_create(client, org_and_user, vehicle_with_twin):
    """Ustvaritev homologacije zapiše audit log z action='create'."""
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "UNECE_R156_AUDIT",
        "status": "open",
    }, headers=org_and_user["headers"])
    assert create_resp.status_code == 201
    hom_id = create_resp.json()["id"]

    audit_resp = await client.get(
        "/api/v1/audit-logs",
        params={"entity_id": hom_id, "action": "create"},
        headers=org_and_user["headers"],
    )
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert any(
        l["entity_type"] == "homologation" and l["action"] == "create"
        for l in logs
    )


@pytest.mark.asyncio
async def test_homologation_audit_on_approve(client, org_and_user, vehicle_with_twin):
    """Odobritev homologacije zapiše audit log z action='approve'."""
    vehicle = vehicle_with_twin["vehicle"]
    create_resp = await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "UNECE_R155_APPROVE",
        "status": "in_progress",
    }, headers=org_and_user["headers"])
    hom_id = create_resp.json()["id"]

    # Odobritev
    update_resp = await client.put(
        f"/api/v1/homologations/{hom_id}",
        json={
            "status": "approved",
            "valid_from": date.today().isoformat(),
            "valid_until": (date.today() + timedelta(days=365)).isoformat(),
        },
        headers=org_and_user["headers"],
    )
    assert update_resp.status_code == 200

    audit_resp = await client.get(
        "/api/v1/audit-logs",
        params={"entity_id": hom_id},
        headers=org_and_user["headers"],
    )
    logs = audit_resp.json()
    actions = [l["action"] for l in logs]
    assert "approve" in actions


@pytest.mark.asyncio
async def test_homologation_org_isolation(client, db_session, org_and_user, vehicle_with_twin):
    """Homologacije druge organizacije niso vidne."""
    from app.models.organization import Organization
    from app.models.vehicle import Vehicle
    from app.models.vehicle_twin import VehicleTwin
    from app.models.homologation import Homologation
    import uuid

    # Org B
    org_b = Organization(name="Hom Isolation Org B", type="tier1")
    db_session.add(org_b)
    await db_session.flush()

    vehicle_b = Vehicle(
        organization_id=org_b.id,
        name="Vozilo B",
        model="TestB",
        year=2024,
        vin=f"HOMB-{uuid.uuid4().hex[:8].upper()}",
    )
    db_session.add(vehicle_b)
    await db_session.flush()

    twin_b = VehicleTwin(vehicle_id=vehicle_b.id)
    db_session.add(twin_b)

    hom_b = Homologation(
        organization_id=org_b.id,
        vehicle_id=vehicle_b.id,
        regulation="ECE_HIDDEN",
        status="approved",
    )
    db_session.add(hom_b)
    await db_session.commit()

    # Org A ne sme videti hom_b
    resp = await client.get("/api/v1/homologations", headers=org_and_user["headers"])
    assert resp.status_code == 200
    regs = [h["regulation"] for h in resp.json()]
    assert "ECE_HIDDEN" not in regs


@pytest.mark.asyncio
async def test_homologation_not_found(client, org_and_user):
    """Neobstoječa homologacija → 404."""
    import uuid
    resp = await client.put(
        f"/api/v1/homologations/{uuid.uuid4()}",
        json={"status": "approved"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_homologation_filter_by_vehicle(client, org_and_user, vehicle_with_twin):
    """Filter po vehicle_id deluje."""
    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "FILTER_TEST_HOM",
        "status": "open",
    }, headers=org_and_user["headers"])

    resp = await client.get(
        f"/api/v1/homologations?vehicle_id={vehicle.id}",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    regs = [h["regulation"] for h in resp.json()]
    assert "FILTER_TEST_HOM" in regs
