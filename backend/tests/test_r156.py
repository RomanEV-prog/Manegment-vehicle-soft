"""
Testi za R156 SUMS register — tip vozila, ECU, RXSWIN, baseline-i, zaklep in preverjanje SHA-256.
"""
import hashlib

import pytest
from httpx import AsyncClient
from sqlalchemy import text

SHA_A = hashlib.sha256(b"bcu-v2.0.hex").hexdigest()
SHA_B = hashlib.sha256(b"bcu-v2.1.hex").hexdigest()
SHA_CFG = hashlib.sha256(b"bcu-config-v1.1").hexdigest()


@pytest.fixture
async def r156(client: AsyncClient, org_and_user):
    """Tip vozila z dvema ECU-jema in RXSWIN-om brez baseline-ov."""
    h = org_and_user["headers"]
    vt = (await client.post("/api/v1/vehicle-types", json={"name": "e-Shuttle MK II-400", "model_code": "ES03"}, headers=h)).json()
    bcu = (await client.post("/api/v1/ecus", json={
        "vehicle_type_id": vt["id"], "ecu_name": "Body Control Unit", "system_name": "Exterior Lighting",
        "supplier": "Continental", "eversum_part_number": "EV-00002-37716", "un_ece_reg_number": "UN-ECE Reg 48",
    }, headers=h)).json()
    mux = (await client.post("/api/v1/ecus", json={
        "vehicle_type_id": vt["id"], "ecu_name": "MUX1", "eversum_part_number": "EV-00000-40775",
    }, headers=h)).json()
    rx = (await client.post("/api/v1/rxswins", json={
        "vehicle_type_id": vt["id"], "rxswin": "R48SWIN001",
        "description": "Exterior Lighting", "regulations_affected": ["UN-ECE R48"],
    }, headers=h)).json()
    return {"vt": vt, "bcu": bcu, "mux": mux, "rx": rx, "h": h}


async def _draft_with_item(client, d, sha=SHA_A, **extra):
    detail = (await client.post(f"/api/v1/rxswins/{d['rx']['id']}/baselines", json={}, headers=d["h"])).json()
    baseline = detail["baselines"][0]
    resp = await client.post(f"/api/v1/rxswin-baselines/{baseline['id']}/items", json={
        "ecu_id": d["bcu"]["id"], "sw_version": "v.2.0", "sw_file_sha256": sha, **extra,
    }, headers=d["h"])
    assert resp.status_code == 201, resp.text
    return resp.json()["baselines"][0]


# ─── Tip vozila in ECU ────────────────────────────────────────────────────────

async def test_vehicle_type_duplicate_rejected(client, r156):
    resp = await client.post("/api/v1/vehicle-types", json={"name": "e-Shuttle MK II-400"}, headers=r156["h"])
    assert resp.status_code == 409


async def test_technician_cannot_create_vehicle_type(client, org_and_user):
    resp = await client.post("/api/v1/vehicle-types", json={"name": "X"}, headers=org_and_user["tech_headers"])
    assert resp.status_code == 403


async def test_ecu_list_filtered_by_type(client, r156):
    resp = await client.get(f"/api/v1/ecus?vehicle_type_id={r156['vt']['id']}", headers=r156["h"])
    assert resp.status_code == 200
    assert [e["ecu_name"] for e in resp.json()] == ["Body Control Unit", "MUX1"]


async def test_ecu_duplicate_name_rejected(client, r156):
    resp = await client.post("/api/v1/ecus", json={
        "vehicle_type_id": r156["vt"]["id"], "ecu_name": "MUX1", "eversum_part_number": "EV-1",
    }, headers=r156["h"])
    assert resp.status_code == 409


async def test_ecu_update_writes_audit(client, r156):
    resp = await client.put(f"/api/v1/ecus/{r156['bcu']['id']}", json={"supplier": "Hella"}, headers=r156["h"])
    assert resp.status_code == 200
    assert resp.json()["supplier"] == "Hella"
    logs = (await client.get("/api/v1/audit-logs", params={"entity_id": r156["bcu"]["id"]}, headers=r156["h"])).json()
    upd = [l for l in logs if l["action"] == "update"]
    assert upd[0]["before"] == {"supplier": "Continental"} and upd[0]["after"] == {"supplier": "Hella"}


# ─── RXSWIN ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("code", ["R48SWIN001", "RXSWIN-EV-M1-221", "VCU_SWIN.002"])
async def test_rxswin_formats_accepted(client, r156, code):
    if code == "R48SWIN001":
        return  # že ustvarjen v fixturi
    resp = await client.post("/api/v1/rxswins", json={"vehicle_type_id": r156["vt"]["id"], "rxswin": code}, headers=r156["h"])
    assert resp.status_code == 201


@pytest.mark.parametrize("code", ["r48swin001", "R4", "R48 SWIN"])
async def test_rxswin_invalid_format(client, r156, code):
    resp = await client.post("/api/v1/rxswins", json={"vehicle_type_id": r156["vt"]["id"], "rxswin": code}, headers=r156["h"])
    assert resp.status_code == 422


async def test_rxswin_duplicate_rejected(client, r156):
    resp = await client.post("/api/v1/rxswins", json={"vehicle_type_id": r156["vt"]["id"], "rxswin": "R48SWIN001"}, headers=r156["h"])
    assert resp.status_code == 409


async def test_rxswin_list_shows_current_and_draft(client, r156):
    b1 = await _draft_with_item(client, r156)
    await client.post(f"/api/v1/rxswin-baselines/{b1['id']}/release", headers=r156["h"])
    await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=r156["h"])

    [row] = (await client.get("/api/v1/rxswins", headers=r156["h"])).json()
    assert row["current_baseline"]["baseline_number"] == 1
    assert row["current_baseline"]["status"] == "released"
    assert row["draft_baseline"]["baseline_number"] == 2
    assert row["baseline_count"] == 2


# ─── Baseline življenjski cikel ───────────────────────────────────────────────

async def test_release_locks_baseline(client, r156):
    b = await _draft_with_item(client, r156, sw_config_version="v.1.1", sw_config_sha256=SHA_CFG.upper())
    assert b["status"] == "draft"
    assert b["items"][0]["sw_config_sha256"] == SHA_CFG  # shranjeno z malimi črkami

    resp = await client.post(f"/api/v1/rxswin-baselines/{b['id']}/release", headers=r156["h"])
    assert resp.status_code == 200, resp.text
    released = resp.json()["baselines"][0]
    assert released["status"] == "released"
    assert released["released_by_name"] == "Test Admin"

    item_id = released["items"][0]["id"]
    edit = await client.put(f"/api/v1/rxswin-baselines/{b['id']}/items/{item_id}", json={"sw_version": "x"}, headers=r156["h"])
    assert edit.status_code == 409
    add = await client.post(f"/api/v1/rxswin-baselines/{b['id']}/items", json={
        "ecu_id": r156["mux"]["id"], "sw_version": "v.3.0", "sw_file_sha256": SHA_B,
    }, headers=r156["h"])
    assert add.status_code == 409
    delete = await client.delete(f"/api/v1/rxswin-baselines/{b['id']}", headers=r156["h"])
    assert delete.status_code == 409


async def test_new_baseline_copies_items_and_supersedes_previous(client, r156):
    b1 = await _draft_with_item(client, r156)
    await client.post(f"/api/v1/rxswin-baselines/{b1['id']}/release", headers=r156["h"])

    detail = (await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={"notes": "BCU 2.1"}, headers=r156["h"])).json()
    b2 = detail["baselines"][0]
    assert b2["baseline_number"] == 2 and b2["status"] == "draft"
    assert len(b2["items"]) == 1 and b2["items"][0]["sw_file_sha256"] == SHA_A

    item_id = b2["items"][0]["id"]
    resp = await client.put(f"/api/v1/rxswin-baselines/{b2['id']}/items/{item_id}", json={
        "sw_version": "v.2.1", "sw_file_sha256": SHA_B,
    }, headers=r156["h"])
    assert resp.status_code == 200

    detail = (await client.post(f"/api/v1/rxswin-baselines/{b2['id']}/release", headers=r156["h"])).json()
    by_number = {b["baseline_number"]: b for b in detail["baselines"]}
    assert by_number[2]["status"] == "released"
    assert by_number[1]["status"] == "superseded"
    # stari baseline ostane nespremenjen in viden
    assert by_number[1]["items"][0]["sw_version"] == "v.2.0"
    assert by_number[1]["items"][0]["sw_file_sha256"] == SHA_A
    assert by_number[2]["items"][0]["sw_version"] == "v.2.1"


async def test_only_one_draft_at_a_time(client, r156):
    await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=r156["h"])
    resp = await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=r156["h"])
    assert resp.status_code == 409


async def test_release_requires_items_and_valid_sha(client, r156):
    detail = (await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=r156["h"])).json()
    bid = detail["baselines"][0]["id"]
    empty = await client.post(f"/api/v1/rxswin-baselines/{bid}/release", headers=r156["h"])
    assert empty.status_code == 422

    # konfiguracija navedena brez SHA-256 → izdaja zavrnjena
    await client.post(f"/api/v1/rxswin-baselines/{bid}/items", json={
        "ecu_id": r156["bcu"]["id"], "sw_version": "v.2.0", "sw_file_sha256": SHA_A, "sw_config_version": "v.1.1",
    }, headers=r156["h"])
    resp = await client.post(f"/api/v1/rxswin-baselines/{bid}/release", headers=r156["h"])
    assert resp.status_code == 422
    assert "Body Control Unit" in resp.json()["detail"]


async def test_invalid_sha_rejected_on_input(client, r156):
    detail = (await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=r156["h"])).json()
    resp = await client.post(f"/api/v1/rxswin-baselines/{detail['baselines'][0]['id']}/items", json={
        "ecu_id": r156["bcu"]["id"], "sw_version": "v.2.0", "sw_file_sha256": "d7f66a732e4b1f..",
    }, headers=r156["h"])
    assert resp.status_code == 422


async def test_ecu_of_other_vehicle_type_rejected(client, r156):
    vt2 = (await client.post("/api/v1/vehicle-types", json={"name": "Drug tip"}, headers=r156["h"])).json()
    ecu2 = (await client.post("/api/v1/ecus", json={
        "vehicle_type_id": vt2["id"], "ecu_name": "BCU", "eversum_part_number": "EV-9",
    }, headers=r156["h"])).json()
    detail = (await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=r156["h"])).json()
    resp = await client.post(f"/api/v1/rxswin-baselines/{detail['baselines'][0]['id']}/items", json={
        "ecu_id": ecu2["id"], "sw_version": "1", "sw_file_sha256": SHA_A,
    }, headers=r156["h"])
    assert resp.status_code == 422


async def test_discard_draft(client, r156):
    b = await _draft_with_item(client, r156)
    resp = await client.delete(f"/api/v1/rxswin-baselines/{b['id']}", headers=r156["h"])
    assert resp.status_code == 200
    assert resp.json()["baselines"] == []
    logs = (await client.get("/api/v1/audit-logs", params={"entity_id": b["id"]}, headers=r156["h"])).json()
    deleted = [l for l in logs if l["action"] == "delete"]
    assert deleted[0]["before"]["items"][0]["sw_file_sha256"] == SHA_A


# ─── Vloge in izolacija ───────────────────────────────────────────────────────

async def test_technician_can_draft_but_not_release(client, r156, org_and_user):
    th = org_and_user["tech_headers"]
    detail = (await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=th))
    assert detail.status_code == 201
    bid = detail.json()["baselines"][0]["id"]
    await client.post(f"/api/v1/rxswin-baselines/{bid}/items", json={
        "ecu_id": r156["bcu"]["id"], "sw_version": "v.2.0", "sw_file_sha256": SHA_A,
    }, headers=th)
    assert (await client.post(f"/api/v1/rxswin-baselines/{bid}/release", headers=th)).status_code == 403
    assert (await client.post(f"/api/v1/rxswin-baselines/{bid}/release", headers=org_and_user["qc_headers"])).status_code == 200


async def test_partner_reads_but_cannot_write(client, r156, org_and_user):
    ph = org_and_user["partner_headers"]
    assert (await client.get(f"/api/v1/rxswins/{r156['rx']['id']}", headers=ph)).status_code == 200
    assert (await client.post(f"/api/v1/rxswins/{r156['rx']['id']}/baselines", json={}, headers=ph)).status_code == 403
    assert (await client.post("/api/v1/rxswins", json={"vehicle_type_id": r156["vt"]["id"], "rxswin": "NEW001"}, headers=ph)).status_code == 403


async def test_other_org_cannot_see_rxswin(client, r156, db_session):
    from app.models.organization import Organization
    from app.models.user import User
    from app.utils.security import create_access_token, hash_password

    org2 = Organization(name="Druga", type="oem")
    db_session.add(org2)
    await db_session.flush()
    u2 = User(organization_id=org2.id, email="x@druga.si", full_name="X", role="admin", password_hash=hash_password("x"))
    db_session.add(u2)
    await db_session.commit()
    h2 = {"Authorization": "Bearer " + create_access_token({"sub": str(u2.id), "org_id": str(org2.id), "role": "admin"})}

    assert (await client.get(f"/api/v1/rxswins/{r156['rx']['id']}", headers=h2)).status_code == 404
    assert (await client.get("/api/v1/rxswins", headers=h2)).json() == []
    assert (await client.post("/api/v1/rxswins", json={"vehicle_type_id": r156["vt"]["id"], "rxswin": "X001"}, headers=h2)).status_code == 404


# ─── Preverjanje SHA-256 ──────────────────────────────────────────────────────

async def test_verify_match_and_mismatch_are_audited(client, r156, org_and_user):
    b = await _draft_with_item(client, r156)
    await client.post(f"/api/v1/rxswin-baselines/{b['id']}/release", headers=r156["h"])
    item_id = b["items"][0]["id"]
    url = f"/api/v1/rxswin-baselines/{b['id']}/items/{item_id}/verify"

    ok = await client.post(url, json={"computed_sha256": SHA_A.upper(), "file_name": "bcu.hex", "file_size": 12},
                           headers=org_and_user["tech_headers"])
    assert ok.status_code == 200 and ok.json()["match"] is True
    bad = await client.post(url, json={"computed_sha256": SHA_B, "file_name": "bcu.hex"}, headers=org_and_user["tech_headers"])
    assert bad.json()["match"] is False
    cfg = await client.post(url, json={"target": "config", "computed_sha256": SHA_A}, headers=org_and_user["tech_headers"])
    assert cfg.json() == {"match": False, "expected_sha256": None, "computed_sha256": SHA_A, "recorded": True}

    logs = (await client.get("/api/v1/audit-logs", params={"entity_id": item_id, "action": "verify"}, headers=r156["h"])).json()
    assert sorted(l["after"]["match"] for l in logs) == [False, False, True]
    assert all(l["actor_id"] == str(org_and_user["tech"].id) for l in logs)
    assert all(l["actor_name"] == "Test Technician" for l in logs)


# ─── Zaklep v bazi (mimo API-ja) ──────────────────────────────────────────────

async def test_database_trigger_blocks_direct_edit(client, r156, test_engine):
    b = await _draft_with_item(client, r156)
    await client.post(f"/api/v1/rxswin-baselines/{b['id']}/release", headers=r156["h"])

    for sql in (
        "UPDATE rxswin_baseline_items SET sw_version = 'hack'",
        "DELETE FROM rxswin_baseline_items",
        "UPDATE rxswin_baselines SET notes = 'hack'",
        "DELETE FROM rxswin_baselines",
    ):
        with pytest.raises(Exception, match="samo za branje|zaklenjen|ni mogoče spreminjati"):
            async with test_engine.begin() as conn:
                await conn.execute(text(sql))
