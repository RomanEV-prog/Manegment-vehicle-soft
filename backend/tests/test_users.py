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
            "password": "Geslo1234!dolgo",
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
            "password": "Geslo1234!dolgo",
            "role": "technician",
        })
        assert resp.status_code == 403

    async def test_duplicate_email_rejected(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": org_and_user["admin"].email,
            "full_name": "Kopija",
            "password": "Geslo1234!dolgo",
            "role": "technician",
        })
        assert resp.status_code == 409

    async def test_invalid_role_rejected(self, client: AsyncClient, org_and_user):
        resp = await client.post("/api/v1/users", headers=org_and_user["headers"], json={
            "email": "invalid.role@test.si",
            "full_name": "Invalid",
            "password": "Geslo1234!dolgo",
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
            "password": "Geslo1234!dolgo",
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
            "password": "Geslo1234!dolgo",
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


# ─── Gesla ────────────────────────────────────────────────────────────────────

async def test_change_own_password(client, org_and_user):
    login = (await client.post("/api/v1/auth/login", json={"email": "test.tech@eversum.com", "password": "test1234"})).json()
    old_refresh = login["refresh_token"]
    h = {"Authorization": f"Bearer {login['access_token']}"}

    bad = await client.put("/api/v1/users/me/password", json={"current_password": "narobe", "new_password": "NovoGeslo!2026x"}, headers=h)
    assert bad.status_code == 400
    short = await client.put("/api/v1/users/me/password", json={"current_password": "test1234", "new_password": "kratko"}, headers=h)
    assert short.status_code == 422

    import asyncio
    await asyncio.sleep(1.1)  # iat je v sekundah — star žeton mora biti izdan pred menjavo
    r = await client.put("/api/v1/users/me/password", json={"current_password": "test1234", "new_password": "NovoGeslo!2026x"}, headers=h)
    assert r.status_code == 200 and r.json()["access_token"]

    assert (await client.post("/api/v1/auth/login", json={"email": "test.tech@eversum.com", "password": "test1234"})).status_code == 401
    assert (await client.post("/api/v1/auth/login", json={"email": "test.tech@eversum.com", "password": "NovoGeslo!2026x"})).status_code == 200
    # star refresh žeton ne velja več, nov pa
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})).status_code == 401
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": r.json()["refresh_token"]})).status_code == 200


async def test_admin_resets_password(client, org_and_user):
    tech = org_and_user["tech"]
    r = await client.post(f"/api/v1/users/{tech.id}/reset-password", headers=org_and_user["headers"])
    assert r.status_code == 200
    temp = r.json()["temporary_password"]
    assert len(temp) >= 12
    assert (await client.post("/api/v1/auth/login", json={"email": tech.email, "password": temp})).status_code == 200
    # geslo ne sme v revizijsko sled
    logs = (await client.get("/api/v1/audit-logs", params={"entity_id": str(tech.id)}, headers=org_and_user["headers"])).json()
    assert temp not in str(logs)


async def test_only_admin_resets_password(client, org_and_user):
    r = await client.post(f"/api/v1/users/{org_and_user['tech'].id}/reset-password", headers=org_and_user["qc_headers"])
    assert r.status_code == 403


async def test_create_user_requires_long_password(client, org_and_user):
    r = await client.post("/api/v1/users", json={
        "email": "kratko@eversum.com", "full_name": "K", "role": "technician", "password": "Geslo1234!",
    }, headers=org_and_user["headers"])
    assert r.status_code == 422


async def test_deactivated_user_access_token_rejected_immediately(client, org_and_user):
    tech_h = org_and_user["tech_headers"]
    assert (await client.get("/api/v1/users/me", headers=tech_h)).status_code == 200
    await client.delete(f"/api/v1/users/{org_and_user['tech'].id}", headers=org_and_user["headers"])
    assert (await client.get("/api/v1/users/me", headers=tech_h)).status_code == 401


async def test_role_change_applies_immediately(client, org_and_user):
    tech_h = org_and_user["tech_headers"]
    await client.put(f"/api/v1/users/{org_and_user['tech'].id}", json={"role": "partner_viewer"}, headers=org_and_user["headers"])
    # stari žeton pravi "technician", baza pa "partner_viewer" → pisanje zavrnjeno
    r = await client.post("/api/v1/vehicle-types", json={"name": "x"}, headers=tech_h)
    assert r.status_code == 403


async def test_failed_login_is_audited(client, org_and_user):
    await client.post("/api/v1/auth/login", json={"email": "test.tech@eversum.com", "password": "narobe"})
    logs = (await client.get("/api/v1/audit-logs", params={"action": "login_failed"}, headers=org_and_user["headers"])).json()
    assert len(logs) == 1 and logs[0]["after"]["email"] == "test.tech@eversum.com"
