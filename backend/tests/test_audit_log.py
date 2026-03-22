"""
Testi za revizijsko sled (audit log) — UNECE R156 §7.4.
"""
import uuid
import pytest
from httpx import AsyncClient


# ─── Helper ───────────────────────────────────────────────────────────────────

async def seed_audit_log(db_session, org_id, **kwargs):
    """Vstavi testni audit log zapis neposredno v bazo."""
    from app.models.audit_log import AuditLog

    defaults = {
        "org_id": org_id,
        "actor_type": "user",
        "action": "update",
        "entity_type": "sw_update",
        "entity_id": uuid.uuid4(),
    }
    defaults.update(kwargs)
    entry = AuditLog(**defaults)
    db_session.add(entry)
    await db_session.commit()
    return entry


# ─── Testi ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_empty_list(client: AsyncClient, org_and_user):
    """Prazen seznam za novo organizacijo."""
    resp = await client.get("/api/v1/audit-logs", headers=org_and_user["headers"])
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_audit_list_returns_records(client: AsyncClient, db_session, org_and_user):
    """Vrne zapise za organizacijo."""
    org_id = org_and_user["org"].id
    await seed_audit_log(db_session, org_id, action="create", entity_type="vehicle")
    await seed_audit_log(db_session, org_id, action="update", entity_type="homologation")

    resp = await client.get("/api/v1/audit-logs", headers=org_and_user["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_audit_filter_by_action(client: AsyncClient, db_session, org_and_user):
    """Filter po akciji deluje."""
    org_id = org_and_user["org"].id
    await seed_audit_log(db_session, org_id, action="delete", entity_type="vehicle")

    resp = await client.get(
        "/api/v1/audit-logs",
        params={"action": "delete"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["action"] == "delete" for r in data)
    assert any(r["action"] == "delete" for r in data)


@pytest.mark.asyncio
async def test_audit_filter_by_entity_type(client: AsyncClient, db_session, org_and_user):
    """Filter po entity_type deluje."""
    org_id = org_and_user["org"].id
    eid = uuid.uuid4()
    await seed_audit_log(db_session, org_id, action="approve", entity_type="homologation", entity_id=eid)

    resp = await client.get(
        "/api/v1/audit-logs",
        params={"entity_type": "homologation"},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["entity_type"] == "homologation" for r in data)


@pytest.mark.asyncio
async def test_audit_filter_by_entity_id(client: AsyncClient, db_session, org_and_user):
    """Filter po entity_id vrne samo zapise za ta ID."""
    org_id = org_and_user["org"].id
    specific_id = uuid.uuid4()
    await seed_audit_log(db_session, org_id, entity_id=specific_id, action="update")
    await seed_audit_log(db_session, org_id, entity_id=uuid.uuid4(), action="update")

    resp = await client.get(
        "/api/v1/audit-logs",
        params={"entity_id": str(specific_id)},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["entity_id"] == str(specific_id) for r in data)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_audit_org_isolation(client: AsyncClient, db_session, org_and_user):
    """Zapisi druge organizacije niso vidni."""
    from app.models.audit_log import AuditLog
    from app.models.organization import Organization

    other_org = Organization(name="Druga org", type="tier1")
    db_session.add(other_org)
    await db_session.flush()

    other_entry = AuditLog(
        org_id=other_org.id,
        actor_type="user",
        action="create",
        entity_type="vehicle",
        entity_id=uuid.uuid4(),
    )
    db_session.add(other_entry)
    await db_session.commit()

    resp = await client.get("/api/v1/audit-logs", headers=org_and_user["headers"])
    assert resp.status_code == 200
    data = resp.json()
    ids = [r["id"] for r in data]
    assert str(other_entry.id) not in ids


@pytest.mark.asyncio
async def test_audit_forbidden_for_technician(client: AsyncClient, org_and_user):
    """Tehnik nima dostopa do audit loga."""
    resp = await client.get("/api/v1/audit-logs", headers=org_and_user["tech_headers"])
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_audit_qc_manager_access(client: AsyncClient, org_and_user):
    """QC manager ima dostop do audit loga."""
    resp = await client.get("/api/v1/audit-logs", headers=org_and_user["qc_headers"])
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_audit_count_endpoint(client: AsyncClient, db_session, org_and_user):
    """Count endpoint vrne število zapisov."""
    resp = await client.get("/api/v1/audit-logs/count", headers=org_and_user["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert "count" in data
    assert isinstance(data["count"], int)


@pytest.mark.asyncio
async def test_audit_pagination(client: AsyncClient, db_session, org_and_user):
    """Paginacija z limit/offset deluje."""
    org_id = org_and_user["org"].id
    for _ in range(5):
        await seed_audit_log(db_session, org_id, action="snapshot")

    resp1 = await client.get(
        "/api/v1/audit-logs", params={"limit": 2, "offset": 0}, headers=org_and_user["headers"]
    )
    resp2 = await client.get(
        "/api/v1/audit-logs", params={"limit": 2, "offset": 2}, headers=org_and_user["headers"]
    )
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # Različni zapisi na različnih straneh
    ids1 = {r["id"] for r in resp1.json()}
    ids2 = {r["id"] for r in resp2.json()}
    assert len(ids1 & ids2) == 0  # Brez prekrivanja


@pytest.mark.asyncio
async def test_audit_before_after_stored(client: AsyncClient, db_session, org_and_user):
    """Before/after JSONB polja se pravilno shranijo in vrnejo."""
    org_id = org_and_user["org"].id
    entry = await seed_audit_log(
        db_session, org_id,
        action="update",
        entity_type="sw_update",
        before={"status": "pending"},
        after={"status": "success"},
        reason="Uspešna posodobitev firmware",
    )

    resp = await client.get(
        "/api/v1/audit-logs",
        params={"entity_id": str(entry.entity_id)},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    record = next(r for r in data if r["id"] == str(entry.id))
    assert record["before"] == {"status": "pending"}
    assert record["after"] == {"status": "success"}
    assert record["reason"] == "Uspešna posodobitev firmware"
