"""
Testi za CoC certifikate — /api/v1/coc-certificates
"""
import pytest
from httpx import AsyncClient


class TestCoCList:
    async def test_list_coc_empty(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(
            "/api/v1/coc-certificates",
            params={"vehicle_id": vehicle_id},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_coc_returns_created(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(
            "/api/v1/coc-certificates",
            json={
                "vehicle_id": vehicle_id,
                "coc_number": "COC-2024-LIST-002",
                "issued_at": "2024-06-01",
            },
            headers=org_and_user["headers"],
        )
        resp = await client.get(
            "/api/v1/coc-certificates",
            params={"vehicle_id": vehicle_id},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        numbers = [i["coc_number"] for i in resp.json()]
        assert "COC-2024-LIST-002" in numbers


class TestCoCCreate:
    async def test_create_coc_full(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        payload = {
            "vehicle_id": vehicle_id,
            "coc_number": "COC-2024-TEST-001",
            "issued_at": "2024-01-15",
            "valid_until": "2027-01-15",
            "issuing_body": "TÜV SÜD",
        }
        resp = await client.post(
            "/api/v1/coc-certificates",
            json=payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["coc_number"] == "COC-2024-TEST-001"
        assert data["issuing_body"] == "TÜV SÜD"
        assert data["vehicle_id"] == vehicle_id

    async def test_create_coc_minimal(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        """Samo coc_number + vehicle_id + issued_at — brez optional polj."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            "/api/v1/coc-certificates",
            json={
                "vehicle_id": vehicle_id,
                "coc_number": "COC-MIN-003",
                "issued_at": "2024-03-01",
            },
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["valid_until"] is None
        assert data["pdf_url"] is None

    async def test_create_coc_writes_audit_log(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            "/api/v1/coc-certificates",
            json={
                "vehicle_id": vehicle_id,
                "coc_number": "COC-AUDIT-007",
                "issued_at": "2025-03-01",
                "issuing_body": "ECE Genf",
            },
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        coc_id = resp.json()["id"]

        audit_resp = await client.get(
            "/api/v1/audit-log",
            headers=org_and_user["headers"],
            params={"entity_type": "coc_certificate", "entity_id": coc_id},
        )
        assert audit_resp.status_code == 200
        logs = audit_resp.json()["items"]
        create_logs = [l for l in logs if l["action"] == "create"]
        assert len(create_logs) == 1
        assert create_logs[0]["after"]["coc_number"] == "COC-AUDIT-007"
        assert create_logs[0]["after"]["issuing_body"] == "ECE Genf"
        assert create_logs[0]["after"]["vehicle_id"] == vehicle_id

    async def test_coc_org_isolation(self, client: AsyncClient, db_session, vehicle_with_twin):
        """Vozilo iz druge org → ne sme vrniti certifikatov."""
        from app.models.organization import Organization
        from app.models.user import User
        from app.utils.security import hash_password, create_access_token

        other_org = Organization(name="Other Org CoC", type="supplier")
        db_session.add(other_org)
        await db_session.flush()
        other_user = User(
            organization_id=other_org.id,
            email="other.coc2@test.com",
            full_name="Other User CoC",
            role="admin",
            password_hash=hash_password("test1234"),
        )
        db_session.add(other_user)
        await db_session.commit()

        token = create_access_token({
            "sub": str(other_user.id),
            "org_id": str(other_org.id),
            "role": "admin",
        })
        headers = {"Authorization": f"Bearer {token}"}

        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(
            "/api/v1/coc-certificates",
            params={"vehicle_id": vehicle_id},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []
