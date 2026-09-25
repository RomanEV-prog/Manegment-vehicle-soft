"""
Testi za vozila — /api/v1/vehicles
"""
import uuid
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient


class TestVehicleList:
    async def test_list_vehicles_empty_or_returns_list(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/vehicles", headers=org_and_user["headers"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_vehicles_filter_by_status(self, client: AsyncClient, org_and_user):
        await client.post("/api/v1/vehicles", json={
            "name": "FilterShipped",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": f"FSHIP-{uuid.uuid4().hex[:8].upper()}",
            "status": "shipped",
        }, headers=org_and_user["headers"])

        resp = await client.get("/api/v1/vehicles?status=shipped", headers=org_and_user["headers"])
        assert resp.status_code == 200
        assert all(v["status"] == "shipped" for v in resp.json())

    async def test_search_vehicles_by_name(self, client: AsyncClient, org_and_user):
        unique_name = f"SearchX{uuid.uuid4().hex[:6]}"
        await client.post("/api/v1/vehicles", json={
            "name": unique_name,
            "model": "TestModel",
            "year": 2023,
            "vin": f"SRCH-{uuid.uuid4().hex[:8].upper()}",
        }, headers=org_and_user["headers"])

        resp = await client.get(
            f"/api/v1/vehicles?search={unique_name}",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        names = [v["name"] for v in resp.json()]
        assert unique_name in names

    async def test_search_vehicles_by_vin(self, client: AsyncClient, org_and_user):
        vin = f"VINUNIQ-{uuid.uuid4().hex[:8].upper()}"
        await client.post("/api/v1/vehicles", json={
            "name": "VinSearchVehicle",
            "model": "TestModel",
            "year": 2023,
            "vin": vin,
        }, headers=org_and_user["headers"])

        resp = await client.get(
            f"/api/v1/vehicles?search={vin}",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        assert vin in [v["vin"] for v in resp.json()]


class TestVehicleCRUD:
    async def test_create_and_get_vehicle(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/vehicles", json={
            "name": "Harlander #1",
            "model": "e-Shuttle MK II-400",
            "year": 2024,
            "vin": f"HAR-{uuid.uuid4().hex[:8].upper()}",
            "project_name": "Imagry Japan",
        }, headers=org_and_user["headers"])
        assert resp.status_code == 201
        vehicle_id = resp.json()["id"]

        get_resp = await client.get(f"/api/v1/vehicles/{vehicle_id}", headers=org_and_user["headers"])
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == "Harlander #1"

    async def test_vehicle_not_found(self, client: AsyncClient, org_and_user):
        resp = await client.get(
            f"/api/v1/vehicles/{uuid.uuid4()}",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404

    async def test_update_vehicle(self, client: AsyncClient, org_and_user):
        create_resp = await client.post("/api/v1/vehicles", json={
            "name": "UpdateMe",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": f"UPD-{uuid.uuid4().hex[:8].upper()}",
        }, headers=org_and_user["headers"])
        vehicle_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/vehicles/{vehicle_id}",
            json={"name": "Updated Name", "status": "in_service"},
            headers=org_and_user["headers"],
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["name"] == "Updated Name"
        assert data["status"] == "in_service"

    async def test_delete_vehicle(self, client: AsyncClient, org_and_user):
        create_resp = await client.post("/api/v1/vehicles", json={
            "name": "DeleteMe",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": f"DEL-{uuid.uuid4().hex[:8].upper()}",
        }, headers=org_and_user["headers"])
        vehicle_id = create_resp.json()["id"]

        del_resp = await client.delete(
            f"/api/v1/vehicles/{vehicle_id}",
            headers=org_and_user["headers"],
        )
        assert del_resp.status_code in (200, 204)

    async def test_shipped_event_published(self, client: AsyncClient, org_and_user):
        create_resp = await client.post("/api/v1/vehicles", json={
            "name": "ShipMe",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": f"SHIP-{uuid.uuid4().hex[:8].upper()}",
        }, headers=org_and_user["headers"])
        vehicle_id = create_resp.json()["id"]

        with patch("app.utils.events.publish_event", new_callable=AsyncMock):
            resp = await client.put(
                f"/api/v1/vehicles/{vehicle_id}",
                json={"status": "shipped"},
                headers=org_and_user["headers"],
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "shipped"


class TestVehicleStats:
    async def test_vehicle_stats_structure(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(
            f"/api/v1/vehicles/{vehicle_id}/stats",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        for key in ("sw_updates", "dtc_active", "dtc_high", "service_records", "hom_approved", "hom_pending"):
            assert key in data
            assert isinstance(data[key], int)
            assert data[key] >= 0

    async def test_vehicle_stats_not_found(self, client: AsyncClient, org_and_user):
        resp = await client.get(
            f"/api/v1/vehicles/{uuid.uuid4()}/stats",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404


class TestVehicleSnapshot:
    async def test_manual_snapshot_creates_record(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            f"/api/v1/vehicles/{vehicle_id}/snapshot",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["trigger_type"] == "manual"
        assert data["vehicle_id"] == vehicle_id
        assert "snapshot" in data

    async def test_get_snapshots_list(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(f"/api/v1/vehicles/{vehicle_id}/snapshot", headers=org_and_user["headers"])
        resp = await client.get(f"/api/v1/vehicles/{vehicle_id}/snapshots", headers=org_and_user["headers"])
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_snapshot_writes_audit_log(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            f"/api/v1/vehicles/{vehicle_id}/snapshot",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201

        audit_resp = await client.get(
            "/api/v1/audit-logs",
            headers=org_and_user["headers"],
            params={"entity_type": "vehicle_twin", "entity_id": vehicle_id},
        )
        assert audit_resp.status_code == 200
        logs = audit_resp.json()
        snap_logs = [l for l in logs if l["action"] == "snapshot"]
        assert len(snap_logs) >= 1
        assert snap_logs[0]["after"]["trigger_type"] == "manual"


class TestVehicleAuditLog:
    async def test_create_vehicle_writes_audit_log(self, client: AsyncClient, org_and_user):
        vin = f"AUDIT-{uuid.uuid4().hex[:8].upper()}"
        resp = await client.post("/api/v1/vehicles", json={
            "name": "AuditVehicle",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": vin,
            "project_name": "AuditProject",
        }, headers=org_and_user["headers"])
        assert resp.status_code == 201
        vehicle_id = resp.json()["id"]

        audit_resp = await client.get(
            "/api/v1/audit-logs",
            headers=org_and_user["headers"],
            params={"entity_type": "vehicle", "entity_id": vehicle_id},
        )
        assert audit_resp.status_code == 200
        logs = audit_resp.json()
        create_logs = [l for l in logs if l["action"] == "create"]
        assert len(create_logs) == 1
        assert create_logs[0]["after"]["vin"] == vin
        assert create_logs[0]["after"]["name"] == "AuditVehicle"

    async def test_update_vehicle_writes_audit_log(self, client: AsyncClient, org_and_user):
        create_resp = await client.post("/api/v1/vehicles", json={
            "name": "AuditUpdateMe",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": f"AUDUP-{uuid.uuid4().hex[:8].upper()}",
        }, headers=org_and_user["headers"])
        vehicle_id = create_resp.json()["id"]

        await client.put(
            f"/api/v1/vehicles/{vehicle_id}",
            json={"status": "in_service"},
            headers=org_and_user["headers"],
        )

        audit_resp = await client.get(
            "/api/v1/audit-logs",
            headers=org_and_user["headers"],
            params={"entity_type": "vehicle", "entity_id": vehicle_id},
        )
        logs = audit_resp.json()
        update_logs = [l for l in logs if l["action"] == "update"]
        assert len(update_logs) >= 1
        assert update_logs[0]["after"]["status"] == "in_service"
