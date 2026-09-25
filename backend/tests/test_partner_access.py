"""
Testi za partner_viewer vlogo — samo bralni dostop.
UNECE R155/R156: partnerji (Arriva, Navya, Imagry) vidijo podatke, ne morejo pisati.
"""
import uuid
import pytest
from httpx import AsyncClient


class TestPartnerReadAccess:
    """Partner vidi vozila in homologacije."""

    async def test_partner_can_list_vehicles(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/vehicles", headers=org_and_user["partner_headers"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_partner_can_get_vehicle(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vid = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(f"/api/v1/vehicles/{vid}", headers=org_and_user["partner_headers"])
        assert resp.status_code == 200

    async def test_partner_can_list_homologations(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/homologations", headers=org_and_user["partner_headers"])
        assert resp.status_code == 200

    async def test_partner_can_list_coc_certificates(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/coc-certificates", headers=org_and_user["partner_headers"])
        assert resp.status_code == 200

    async def test_partner_can_list_vecto(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vid = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(f"/api/v1/vecto-calculations?vehicle_id={vid}", headers=org_and_user["partner_headers"])
        assert resp.status_code == 200


class TestPartnerWriteBlocked:
    """Partner ne sme pisati — 403 na vseh write endpointih."""

    async def test_partner_cannot_create_vehicle(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/vehicles", json={
            "name": "PartnerVehicle",
            "model": "e-Shuttle",
            "year": 2024,
            "vin": f"PV-{uuid.uuid4().hex[:8].upper()}",
        }, headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_update_vehicle(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vid = str(vehicle_with_twin["vehicle"].id)
        resp = await client.put(f"/api/v1/vehicles/{vid}", json={"name": "Hacked"},
                                headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_delete_vehicle(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vid = str(vehicle_with_twin["vehicle"].id)
        resp = await client.delete(f"/api/v1/vehicles/{vid}", headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_create_homologation(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        resp = await client.post("/api/v1/homologations", json={
            "vehicle_id": str(vehicle_with_twin["vehicle"].id),
            "regulation": "R155",
            "status": "pending",
            "authority": "ECE",
            "country": "SI",
        }, headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_create_sw_update(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        resp = await client.post("/api/v1/sw-updates", json={
            "vehicle_id": str(vehicle_with_twin["vehicle"].id),
            "version": "1.0.0",
            "component": "ECU",
            "status": "pending",
        }, headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_create_dtc(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        resp = await client.post("/api/v1/dtc-records", json={
            "vehicle_id": str(vehicle_with_twin["vehicle"].id),
            "code": "P0001",
            "description": "Test",
            "severity": "low",
        }, headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_create_service_record(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        resp = await client.post("/api/v1/service-records", json={
            "vehicle_id": str(vehicle_with_twin["vehicle"].id),
            "service_type": "maintenance",
            "technician": "Test Tech",
            "date_performed": "2024-01-01",
        }, headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_create_vecto(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        resp = await client.post("/api/v1/vecto-calculations", json={
            "vehicle_id": str(vehicle_with_twin["vehicle"].id),
            "status": "draft",
        }, headers=org_and_user["partner_headers"])
        assert resp.status_code == 403

    async def test_partner_cannot_create_snapshot(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vid = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(f"/api/v1/vehicles/{vid}/snapshot",
                                 headers=org_and_user["partner_headers"])
        assert resp.status_code == 403
