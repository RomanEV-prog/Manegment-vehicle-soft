"""
Testi za /api/v1/users — upravljanje uporabnikov.
"""
import pytest
from httpx import AsyncClient


class TestUserList:
    async def test_admin_can_list_users(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/users", headers=org_and_user["headers"])
        assert resp.status_code == 200
        emails = [u["email"] for u in resp.json()]
        assert org_and_user["admin"].email in emails

    async def test_technician_cannot_list_users(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/users", headers=org_and_user["tech_headers"])
        assert resp.status_code == 403

    async def test_qc_can_list_users(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/users", headers=org_and_user["qc_headers"])
        assert resp.status_code == 200


class TestUserCreate:
    async def test_admin_creates_user(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": "novitehnik@test.si",
            "full_name": "Novi Tehnik",
            "password": "Geslo1234!",
            "role": "technician",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "novitehnik@test.si"
        assert data["role"] == "technician"
        assert data["is_active"] is True

    async def test_technician_cannot_create_user(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/users", headers=org_and_user["tech_headers"], json={
            "email": "drug@test.si",
            "full_name": "Drug",
            "password": "Geslo1234!",
            "role": "technician",
        })
        assert resp.status_code == 403

    async def test_duplicate_email_rejected(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": org_and_user["admin"].email,
            "full_name": "Kopija",
            "password": "Geslo1234!",
            "role": "technician",
        })
        assert resp.status_code == 409

    async def test_invalid_role_rejected(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": "invalid.role@test.si",
            "full_name": "Invalid",
            "password": "Geslo1234!",
            "role": "superadmin",
        })
        assert resp.status_code == 422


class TestUserDeactivate:
    async def test_admin_deactivates_user(self, client: AsyncClient, org_and_user):
        tech_id = str(org_and_user["tech"].id)
        resp = await client.delete(f"/api/v1/users/{tech_id}", headers=org_and_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_cannot_deactivate_self(self, client: AsyncClient, org_and_user):
        admin_id = str(org_and_user["admin"].id)
        resp = await client.delete(f"/api/v1/users/{admin_id}", headers=org_and_user["headers"])
        assert resp.status_code == 400


class TestGetMe:
    async def test_get_me_returns_current_user(self, client: AsyncClient, org_and_user):
        resp = await client.get("/api/v1/users/me", headers=org_and_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["email"] == org_and_user["admin"].email
        assert resp.json()["role"] == "admin"


class TestUserAuditLog:
    async def test_create_user_writes_audit_log(self, client: AsyncClient, org_and_user):
        """Ustvaritev uporabnika zapiše audit log."""
        import uuid
        email = f"audit.user.{uuid.uuid4().hex[:6]}@test.si"
        create_resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": email,
            "full_name": "Audit Tehnik",
            "password": "Geslo1234!",
            "role": "technician",
        })
        assert create_resp.status_code == 201
        user_id = create_resp.json()["id"]

        audit_resp = await client.get(
            "/api/v1/audit-logs",
            params={"entity_id": user_id, "action": "create"},
            headers=org_and_user["headers"],
        )
        assert audit_resp.status_code == 200
        logs = audit_resp.json()
        assert any(
            l["entity_type"] == "user" and l["action"] == "create"
            for l in logs
        )

    async def test_deactivate_user_writes_audit_log(self, client: AsyncClient, org_and_user):
        """Deaktivacija uporabnika zapiše audit log."""
        import uuid
        # Ustvari novega tehnika
        email = f"deact.{uuid.uuid4().hex[:6]}@test.si"
        create_resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": email,
            "full_name": "Deactivate Me",
            "password": "Geslo1234!",
            "role": "technician",
        })
        user_id = create_resp.json()["id"]

        # Deaktiviraj
        del_resp = await client.delete(
            f"/api/v1/users/{user_id}",
            headers=org_and_user["headers"],
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["is_active"] is False

        # Preveri audit log — action="update" z before.is_active=True, after.is_active=False
        audit_resp = await client.get(
            "/api/v1/audit-logs",
            params={"entity_id": user_id},
            headers=org_and_user["headers"],
        )
        logs = audit_resp.json()
        deact_logs = [
            l for l in logs
            if l["action"] == "update"
            and l.get("after", {}).get("is_active") is False
        ]
        assert len(deact_logs) >= 1

    async def test_user_org_isolation_in_list(self, client: AsyncClient, db_session, org_and_user):
        """Uporabniki druge org niso vidni."""
        from app.models.organization import Organization
        from app.models.user import User as UserModel
        from app.utils.security import hash_password
        import uuid

        org_b = Organization(name=f"User Isolation Org {uuid.uuid4().hex[:4]}", type="tier1")
        db_session.add(org_b)
        await db_session.flush()

        user_b = UserModel(
            organization_id=org_b.id,
            email=f"hidden.{uuid.uuid4().hex[:6]}@orgb.si",
            full_name="Hidden User B",
            role="technician",
            password_hash=hash_password("test1234"),
        )
        db_session.add(user_b)
        await db_session.commit()

        resp = await client.get("/api/v1/users", headers=org_and_user["headers"])
        assert resp.status_code == 200
        emails = [u["email"] for u in resp.json()]
        assert user_b.email not in emails
