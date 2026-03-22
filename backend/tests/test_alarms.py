from datetime import datetime, timezone
import pytest


# ─── Helper ───────────────────────────────────────────────────────────────────

async def seed_alarm(db_session, org_id, vehicle_id=None, **kwargs):
    from app.models.alarm_event import AlarmEvent
    defaults = {
        "organization_id": org_id,
        "alarm_type": "dtc_high_severity",
        "severity": "warning",
        "title": "Test alarm",
        "message": "Testno sporočilo",
        "is_read": False,
    }
    if vehicle_id:
        defaults["vehicle_id"] = vehicle_id
    defaults.update(kwargs)
    alarm = AlarmEvent(**defaults)
    db_session.add(alarm)
    await db_session.commit()
    return alarm


# ─── Testi ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_alarms_empty(client, org_and_user):
    response = await client.get("/api/v1/alarms", headers=org_and_user["headers"])
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_create_alarm_config(client, org_and_user):
    response = await client.post("/api/v1/alarms/configs", json={
        "alarm_type": "dtc_high_severity",
        "is_active": True,
        "channels": ["email", "ws"],
        "recipient_roles": ["qc_manager", "admin"],
        "threshold": None,
    }, headers=org_and_user["headers"])
    assert response.status_code == 201
    data = response.json()
    assert data["alarm_type"] == "dtc_high_severity"
    assert "email" in data["channels"]


@pytest.mark.asyncio
async def test_mark_alarm_read(client, db_session, org_and_user, vehicle_with_twin):
    """Ustvari alarm in ga označi kot prebranega."""
    from app.models.alarm_event import AlarmEvent

    vehicle = vehicle_with_twin["vehicle"]
    alarm = AlarmEvent(
        organization_id=org_and_user["org"].id,
        vehicle_id=vehicle.id,
        alarm_type="test_alarm",
        severity="warning",
        title="Test alarm",
        message="To je testni alarm",
        is_read=False,
    )
    db_session.add(alarm)
    await db_session.commit()

    response = await client.patch(
        f"/api/v1/alarms/{alarm.id}/read",
        headers=org_and_user["headers"],
    )
    assert response.status_code == 200

    # Preveri da je prebrano
    response = await client.get(
        "/api/v1/alarms?is_read=false",
        headers=org_and_user["headers"],
    )
    alarm_ids = [a["id"] for a in response.json()]
    assert str(alarm.id) not in alarm_ids


@pytest.mark.asyncio
async def test_alarm_org_isolation(client, db_session, org_and_user):
    """Alarmi ene org niso vidni drugi org."""
    from app.models.organization import Organization
    from app.models.user import User
    from app.models.alarm_event import AlarmEvent
    from app.utils.security import hash_password, create_access_token

    # Org B z alarmom
    org_b = Organization(name="Alarm Test Org B", type="partner")
    db_session.add(org_b)
    await db_session.flush()

    alarm_b = AlarmEvent(
        organization_id=org_b.id,
        alarm_type="dtc_high_severity",
        severity="critical",
        title="Skrit alarm org B",
        message="Ne sme biti viden org A",
    )
    db_session.add(alarm_b)

    user_b = User(
        organization_id=org_b.id,
        email=f"alarmtest_{__import__('uuid').uuid4().hex[:6]}@test.com",
        full_name="User B",
        role="admin",
        password_hash=hash_password("pass"),
    )
    db_session.add(user_b)
    await db_session.commit()

    # Org A ne sme videti alarmov org B
    response = await client.get("/api/v1/alarms", headers=org_and_user["headers"])
    alarm_titles = [a["title"] for a in response.json()]
    assert "Skrit alarm org B" not in alarm_titles


@pytest.mark.asyncio
async def test_filter_alarms_by_severity(client, db_session, org_and_user):
    """Filter po severity vrne samo ustrezne alarme."""
    org_id = org_and_user["org"].id
    await seed_alarm(db_session, org_id, severity="critical", title="Kritični alarm")
    await seed_alarm(db_session, org_id, severity="info", title="Info alarm")

    resp = await client.get(
        "/api/v1/alarms?severity=critical",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(a["severity"] == "critical" for a in data)
    titles = [a["title"] for a in data]
    assert "Kritični alarm" in titles
    assert "Info alarm" not in titles


@pytest.mark.asyncio
async def test_filter_alarms_by_alarm_type(client, db_session, org_and_user):
    """Filter po alarm_type vrne samo ustrezne alarme."""
    org_id = org_and_user["org"].id
    await seed_alarm(db_session, org_id, alarm_type="sw_rollback", title="SW rollback alarm")
    await seed_alarm(db_session, org_id, alarm_type="dtc_high_severity", title="DTC alarm")

    resp = await client.get(
        "/api/v1/alarms?alarm_type=sw_rollback",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(a["alarm_type"] == "sw_rollback" for a in data)


@pytest.mark.asyncio
async def test_filter_alarms_is_read_false(client, db_session, org_and_user):
    """is_read=false vrne samo neprebrane alarme."""
    org_id = org_and_user["org"].id
    await seed_alarm(db_session, org_id, is_read=False, title="Neprebran")
    await seed_alarm(db_session, org_id, is_read=True, title="Prebran")

    resp = await client.get(
        "/api/v1/alarms?is_read=false",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(not a["is_read"] for a in data)
    titles = [a["title"] for a in data]
    assert "Neprebran" in titles
    assert "Prebran" not in titles


@pytest.mark.asyncio
async def test_filter_alarms_is_read_true(client, db_session, org_and_user):
    """is_read=true vrne samo prebrane alarme."""
    org_id = org_and_user["org"].id
    await seed_alarm(db_session, org_id, is_read=True, title="Prebrano sporocilo")

    resp = await client.get(
        "/api/v1/alarms?is_read=true",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(a["is_read"] for a in data)


@pytest.mark.asyncio
async def test_alarms_pagination_offset(client, db_session, org_and_user):
    """Offset paginacija — različne strani vrnejo različne alarme."""
    org_id = org_and_user["org"].id
    for i in range(5):
        await seed_alarm(db_session, org_id, title=f"Alarm {i}")

    resp1 = await client.get(
        "/api/v1/alarms?limit=2&offset=0",
        headers=org_and_user["headers"],
    )
    resp2 = await client.get(
        "/api/v1/alarms?limit=2&offset=2",
        headers=org_and_user["headers"],
    )
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    ids1 = {a["id"] for a in resp1.json()}
    ids2 = {a["id"] for a in resp2.json()}
    assert len(ids1 & ids2) == 0


@pytest.mark.asyncio
async def test_mark_all_alarms_read(client, db_session, org_and_user):
    """mark-all-read označi vse neprebrane alarme kot prebrane."""
    org_id = org_and_user["org"].id
    for i in range(3):
        await seed_alarm(db_session, org_id, is_read=False, title=f"Neprebran {i}")

    resp = await client.post(
        "/api/v1/alarms/mark-all-read",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200

    # Preverimo da ni več neprebranih
    check = await client.get(
        "/api/v1/alarms?is_read=false",
        headers=org_and_user["headers"],
    )
    assert check.status_code == 200
    assert check.json() == []


@pytest.mark.asyncio
async def test_update_alarm_config(client, org_and_user):
    """Posodobitev alarm config — toggle is_active."""
    # Ustvari config
    create_resp = await client.post("/api/v1/alarms/configs", json={
        "alarm_type": "scheduled_check",
        "is_active": True,
        "channels": ["email"],
        "recipient_roles": ["admin"],
        "threshold": None,
    }, headers=org_and_user["headers"])
    assert create_resp.status_code == 201
    cfg_id = create_resp.json()["id"]

    # Deaktiviraj
    update_resp = await client.put(
        f"/api/v1/alarms/configs/{cfg_id}",
        json={
            "alarm_type": "scheduled_check",
            "is_active": False,
            "channels": ["email"],
            "recipient_roles": ["admin"],
            "threshold": None,
        },
        headers=org_and_user["headers"],
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_list_alarm_configs(client, org_and_user):
    """List configs vrne ustvarjene konfiguracije."""
    await client.post("/api/v1/alarms/configs", json={
        "alarm_type": "vecto_missing",
        "is_active": True,
        "channels": ["ws"],
        "recipient_roles": ["qc_manager"],
        "threshold": None,
    }, headers=org_and_user["headers"])

    resp = await client.get("/api/v1/alarms/configs", headers=org_and_user["headers"])
    assert resp.status_code == 200
    types = [c["alarm_type"] for c in resp.json()]
    assert "vecto_missing" in types
