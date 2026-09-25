import pytest


@pytest.mark.asyncio
async def test_login_success(client, org_and_user):
    response = await client.post("/api/v1/auth/login", json={
        "email": "test.admin@eversum.com",
        "password": "test1234",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client, org_and_user):
    response = await client.post("/api/v1/auth/login", json={
        "email": "test.admin@eversum.com",
        "password": "napacno",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client, org_and_user):
    response = await client.post("/api/v1/auth/login", json={
        "email": "neznan@eversum.com",
        "password": "test1234",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_without_token(client):
    response = await client.get("/api/v1/vehicles")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_rejected(client):
    """Neveljaven JWT → 401."""
    response = await client.get(
        "/api/v1/vehicles",
        headers={"Authorization": "Bearer to.je.neveljaven.token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client, org_and_user):
    """Refresh token vrne nov access_token."""
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "test.admin@eversum.com",
        "password": "test1234",
    })
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    refresh_resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_logout(client, org_and_user):
    """Logout vrne 200 z sporočilom."""
    resp = await client.post("/api/v1/auth/logout", headers=org_and_user["headers"])
    assert resp.status_code == 200
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_login_writes_audit_log(client, org_and_user):
    """Prijava zapiše audit log z action='login'."""
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "test.admin@eversum.com",
        "password": "test1234",
    })
    assert login_resp.status_code == 200

    # Preveri audit log
    audit_resp = await client.get(
        "/api/v1/audit-logs",
        params={"action": "login"},
        headers=org_and_user["headers"],
    )
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert any(l["action"] == "login" and l["entity_type"] == "user" for l in logs)


@pytest.mark.asyncio
async def test_inactive_user_cannot_login(client, db_session, org_and_user):
    """Deaktivirani uporabnik ne more prijaviti."""
    from app.models.user import User
    from app.utils.security import hash_password
    from sqlalchemy import select

    # Ustvari neaktivnega uporabnika
    inactive = User(
        organization_id=org_and_user["org"].id,
        email="inactive@eversum.com",
        full_name="Neaktiven",
        role="technician",
        password_hash=hash_password("test1234"),
        is_active=False,
    )
    db_session.add(inactive)
    await db_session.commit()

    resp = await client.post("/api/v1/auth/login", json={
        "email": "inactive@eversum.com",
        "password": "test1234",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_org_isolation(client, db_session):
    """Kritično: user A ne vidi podatkov org B."""
    from app.models.organization import Organization
    from app.models.user import User
    from app.models.vehicle import Vehicle
    from app.utils.security import hash_password, create_access_token

    # Org B
    org_b = Organization(name="Org B", type="partner")
    db_session.add(org_b)
    await db_session.flush()

    user_b = User(
        organization_id=org_b.id,
        email="b@example.com",
        full_name="User B",
        role="technician",
        password_hash=hash_password("pass"),
    )
    db_session.add(user_b)
    await db_session.flush()

    # Vozilo org B
    vehicle_b = Vehicle(
        organization_id=org_b.id,
        name="Skrito vozilo",
        model="Test",
        year=2024,
        vin="VIN-ORG-B-001",
    )
    db_session.add(vehicle_b)
    await db_session.commit()

    # Token za org A (test@eversum.com)
    from app.models.organization import Organization as Org
    from sqlalchemy import select
    result = await db_session.execute(select(Org).where(Org.name == "Test eVersum"))
    org_a = result.scalar_one_or_none()

    if org_a:
        token_a = create_access_token({"sub": "some-id", "org_id": str(org_a.id), "role": "admin"})
        response = await client.get("/api/v1/vehicles", headers={"Authorization": f"Bearer {token_a}"})
        vehicles = response.json()
        vins = [v["vin"] for v in vehicles]
        assert "VIN-ORG-B-001" not in vins, "Org isolation je pokvarjena!"


async def test_login_rate_limited_after_repeated_failures(client, org_and_user):
    """Po 10 neuspelih poskusih je prijava začasno blokirana — tudi s pravim geslom."""
    from app.utils.login_limit import MAX_FAILURES

    for _ in range(MAX_FAILURES):
        r = await client.post("/api/v1/auth/login", json={"email": "test.admin@eversum.com", "password": "narobe"})
        assert r.status_code == 401
    blocked = await client.post("/api/v1/auth/login", json={"email": "test.admin@eversum.com", "password": "test1234"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


async def test_successful_login_resets_failure_count(client, org_and_user):
    for _ in range(5):
        await client.post("/api/v1/auth/login", json={"email": "test.admin@eversum.com", "password": "narobe"})
    ok = await client.post("/api/v1/auth/login", json={"email": "test.admin@eversum.com", "password": "test1234"})
    assert ok.status_code == 200


async def test_refresh_token_in_httponly_cookie(client, org_and_user):
    r = await client.post("/api/v1/auth/login", json={"email": "test.admin@eversum.com", "password": "test1234"})
    cookie = r.headers["set-cookie"]
    assert "sums_refresh=" in cookie and "HttpOnly" in cookie and "Path=/api/v1/auth" in cookie
    assert "samesite=strict" in cookie.lower()
    token = cookie.split("sums_refresh=")[1].split(";")[0]
    # osvežitev samo s piškotom (brez telesa), kot jo naredi spletni odjemalec
    r2 = await client.post("/api/v1/auth/refresh", cookies={"sums_refresh": token})
    assert r2.status_code == 200 and r2.json()["access_token"]
    assert "sums_refresh=" in r2.headers["set-cookie"]   # rotacija
    # brez piškota in telesa
    client.cookies.clear()
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_logout_clears_cookie_without_valid_access_token(client, org_and_user):
    r = await client.post("/api/v1/auth/logout")
    assert r.status_code == 200
    assert 'sums_refresh=""' in r.headers["set-cookie"] or "Max-Age=0" in r.headers["set-cookie"]
