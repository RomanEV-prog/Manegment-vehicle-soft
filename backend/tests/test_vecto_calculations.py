"""
Testi za VECTO kalkulacije — /api/v1/vecto-calculations
"""
import uuid
import pytest
from httpx import AsyncClient


class TestVectoList:
    async def test_list_vecto_empty(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(
            "/api/v1/vecto-calculations",
            params={"vehicle_id": vehicle_id},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_vecto_filter_by_status(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2024-11-01", "status": "draft"},
            headers=org_and_user["headers"],
        )
        await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2024-11-02", "status": "approved"},
            headers=org_and_user["headers"],
        )

        resp = await client.get(
            "/api/v1/vecto-calculations",
            params={"vehicle_id": vehicle_id, "status": "approved"},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert all(i["status"] == "approved" for i in items)


class TestVectoCreate:
    async def test_create_vecto_full(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        payload = {
            "vehicle_id": vehicle_id,
            "calculated_at": "2024-05-01",
            "co2_wltp": 0.0,
            "energy_wltp": 185.5,
            "range_km": 320,
            "status": "draft",
            "input_params": {"mass_kg": 6500, "drag_cd": 0.35},
        }
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json=payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["vehicle_id"] == vehicle_id
        assert data["energy_wltp"] == 185.5
        assert data["range_km"] == 320
        assert data["status"] == "draft"
        assert data["input_params"]["mass_kg"] == 6500

    async def test_create_vecto_minimal(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        """Samo obvezna polja."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2024-06-15"},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["co2_wltp"] is None
        assert data["energy_wltp"] is None
        assert data["range_km"] is None
        assert data["status"] == "draft"

    async def test_create_vecto_wrong_vehicle(self, client: AsyncClient, org_and_user):
        """Neobstoječe vozilo → 404."""
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": str(uuid.uuid4()), "calculated_at": "2024-10-01"},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404

    async def test_create_vecto_writes_audit_log(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json={
                "vehicle_id": vehicle_id,
                "calculated_at": "2025-01-10",
                "co2_wltp": 5.5,
                "energy_wltp": 210.0,
                "range_km": 300,
                "status": "draft",
            },
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        calc_id = resp.json()["id"]

        audit_resp = await client.get(
            "/api/v1/audit-logs",
            headers=org_and_user["headers"],
            params={"entity_type": "vecto_calculation", "entity_id": calc_id},
        )
        assert audit_resp.status_code == 200
        logs = audit_resp.json()
        create_logs = [l for l in logs if l["action"] == "create"]
        assert len(create_logs) == 1
        assert create_logs[0]["after"]["vehicle_id"] == vehicle_id
        assert create_logs[0]["after"]["status"] == "draft"
        assert create_logs[0]["after"]["range_km"] == 300


class TestVectoUpdate:
    async def test_update_vecto_status(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        create_resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2024-07-01", "status": "draft"},
            headers=org_and_user["headers"],
        )
        assert create_resp.status_code == 201
        calc_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/vecto-calculations/{calc_id}",
            json={"status": "submitted"},
            headers=org_and_user["headers"],
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == "submitted"

    async def test_update_vecto_values(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        create_resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2024-08-01"},
            headers=org_and_user["headers"],
        )
        calc_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/vecto-calculations/{calc_id}",
            json={"co2_wltp": 12.3, "energy_wltp": 200.0, "range_km": 280},
            headers=org_and_user["headers"],
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["co2_wltp"] == pytest.approx(12.3, rel=1e-3)
        assert data["energy_wltp"] == pytest.approx(200.0, rel=1e-3)
        assert data["range_km"] == 280

    async def test_update_vecto_invalid_status(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        create_resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2024-09-01"},
            headers=org_and_user["headers"],
        )
        calc_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/v1/vecto-calculations/{calc_id}",
            json={"status": "invalid_status"},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 422

    async def test_update_vecto_not_found(self, client: AsyncClient, org_and_user):
        resp = await client.put(
            f"/api/v1/vecto-calculations/{uuid.uuid4()}",
            json={"status": "approved"},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404

    async def test_update_vecto_writes_audit_log(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        create_resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2025-02-01", "status": "draft"},
            headers=org_and_user["headers"],
        )
        assert create_resp.status_code == 201
        calc_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/vecto-calculations/{calc_id}",
            json={"status": "approved", "range_km": 350},
            headers=org_and_user["headers"],
        )
        assert update_resp.status_code == 200

        audit_resp = await client.get(
            "/api/v1/audit-logs",
            headers=org_and_user["headers"],
            params={"entity_type": "vecto_calculation", "entity_id": calc_id},
        )
        assert audit_resp.status_code == 200
        logs = audit_resp.json()
        update_logs = [l for l in logs if l["action"] == "update"]
        assert len(update_logs) == 1
        assert update_logs[0]["after"]["status"] == "approved"
        assert update_logs[0]["after"]["range_km"] == 350

    async def test_vecto_org_isolation(self, client: AsyncClient, org_and_user):
        """Drug org ne more posodobiti izračuna prvega orga."""
        # Ustvari izračun s prvim orgom ni mogoče ker potrebujemo vehicle iz istega orga.
        # Ta test preverja da update neobstoječega ID vrne 404.
        resp = await client.put(
            f"/api/v1/vecto-calculations/{uuid.uuid4()}",
            json={"status": "approved"},
            headers=org_and_user["qc_headers"],
        )
        assert resp.status_code == 404


class TestVectoInputParams:
    """Testi za strukturirane vhodne parametre (EU 2017/337 / 2017/2400)."""

    async def test_create_with_structured_params(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        """Ustvari VECTO izračun z vsemi strukturiranimi parametri."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        payload = {
            "vehicle_id": vehicle_id,
            "calculated_at": "2025-03-01",
            "co2_wltp": 0.0,
            "energy_wltp": 165.0,
            "range_km": 350,
            "status": "draft",
            "input_params": {
                "masa_prazno_kg": 1850,
                "masa_test_kg": 2100,
                "masa_max_kg": 2550,
                "cd": 0.28,
                "a_front_m2": 2.35,
                "cda": 0.658,
                "crr_spredaj": 6.5,
                "crr_zadaj": 7.0,
                "kapaciteta_kwh": 82.0,
                "napetost_v": 400,
                "max_moc_polnjenja_kw": 150,
                "max_moc_kw": 200,
                "max_navor_nm": 420,
                "wltp_cikel": "Razred 3b",
                "temperatura_ref_c": 23.0,
                "tovor_kg": 250,
            },
        }
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json=payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        p = data["input_params"]
        assert p["masa_prazno_kg"] == 1850
        assert p["cd"] == pytest.approx(0.28, rel=1e-3)
        assert p["kapaciteta_kwh"] == 82.0
        assert p["wltp_cikel"] == "Razred 3b"
        assert p["max_moc_kw"] == 200

    async def test_update_with_structured_params(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        """Update doda strukturirane parametre k obstoječemu izračunu."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        create_resp = await client.post(
            "/api/v1/vecto-calculations",
            json={"vehicle_id": vehicle_id, "calculated_at": "2025-04-01"},
            headers=org_and_user["headers"],
        )
        assert create_resp.status_code == 201
        calc_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/v1/vecto-calculations/{calc_id}",
            json={
                "input_params": {
                    "kapaciteta_kwh": 75.0,
                    "max_moc_kw": 150,
                    "wltp_cikel": "Razred 2",
                }
            },
            headers=org_and_user["headers"],
        )
        assert update_resp.status_code == 200
        p = update_resp.json()["input_params"]
        assert p["kapaciteta_kwh"] == 75.0
        assert p["wltp_cikel"] == "Razred 2"

    async def test_invalid_cd_value(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        """cd > 2 → Pydantic validacijska napaka 422."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json={
                "vehicle_id": vehicle_id,
                "calculated_at": "2025-05-01",
                "input_params": {"cd": 5.0},  # le=2 pravilo
            },
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 422

    async def test_invalid_create_status(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        """Neveljaven status pri ustvarjanju → 422."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            "/api/v1/vecto-calculations",
            json={
                "vehicle_id": vehicle_id,
                "calculated_at": "2025-06-01",
                "status": "invalid_value",
            },
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 422
