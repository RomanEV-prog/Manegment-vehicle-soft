"""
Testi za Software Update dokument (R156 §7.1.2.5): ustvarjanje, pogoji za izdajo,
ciljna vozila, zaklep po izdaji, revizije, PDF poročila.
"""
import hashlib
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

SHA1 = hashlib.sha256(b"vcu-1.2.115").hexdigest()
SHA2 = hashlib.sha256(b"vcu-1.2.116").hexdigest()


@pytest.fixture
async def su(client: AsyncClient, org_and_user):
    """Tip vozila, RXSWIN z izdanima baseline-oma 1 in 2, dve vozili tega tipa in eno drugega."""
    h = org_and_user["headers"]
    vt = (await client.post("/api/v1/vehicle-types", json={"name": "e-Shuttle MK II-400"}, headers=h)).json()
    other = (await client.post("/api/v1/vehicle-types", json={"name": "Drug tip"}, headers=h)).json()
    ecu = (await client.post("/api/v1/ecus", json={
        "vehicle_type_id": vt["id"], "ecu_name": "Vehicle Control Unit", "eversum_part_number": "EV-00000-41817",
    }, headers=h)).json()
    rx = (await client.post("/api/v1/rxswins", json={"vehicle_type_id": vt["id"], "rxswin": "VCUSWIN001"}, headers=h)).json()

    ids = []
    for sha, ver in ((SHA1, "1.2.115"), (SHA2, "1.2.116")):
        d = (await client.post(f"/api/v1/rxswins/{rx['id']}/baselines", json={}, headers=h)).json()
        b = d["baselines"][0]
        if b["items"]:
            await client.put(f"/api/v1/rxswin-baselines/{b['id']}/items/{b['items'][0]['id']}",
                             json={"sw_version": ver, "sw_file_sha256": sha}, headers=h)
        else:
            await client.post(f"/api/v1/rxswin-baselines/{b['id']}/items",
                              json={"ecu_id": ecu["id"], "sw_version": ver, "sw_file_sha256": sha,
                                    "sw_file_name": f"vcu_{ver}.hex", "change_log": "* test"}, headers=h)
        r = await client.post(f"/api/v1/rxswin-baselines/{b['id']}/release", headers=h)
        assert r.status_code == 200, r.text
        ids.append(b["id"])

    vehicles = []
    for vin, t in (("VIN0000000000001", vt), ("VIN0000000000002", vt), ("VIN0000000000009", other)):
        v = await client.post("/api/v1/vehicles", json={
            "name": vin[-4:], "model": t["name"], "year": 2025, "vin": vin, "vehicle_type_id": t["id"],
        }, headers=h)
        assert v.status_code == 201, v.text
        vehicles.append(v.json())
    return {"h": h, "vt": vt, "rx": rx, "b1": ids[0], "b2": ids[1], "v": vehicles, "ecu": ecu}


async def _doc(client, su, **fields):
    d = (await client.post("/api/v1/software-updates", json={
        "vehicle_type_id": su["vt"]["id"], "title": "VCU 1.2.116",
        "description_purpose": "Restore DC charging limit to 200 A",
    }, headers=su["h"])).json()
    if fields:
        d = (await client.put(f"/api/v1/software-updates/{d['id']}", json=fields, headers=su["h"])).json()
    return d


COMPLETE = {
    "dependencies_identified": "None — VCU only",
    "system_schemes_baseline": "SSB-ES03-12",
    "type_approval_update_necessary": False,
    "type_approval_justification": "No change to R48/R10 relevant functions",
    "execution_conditions": "Workshop, vehicle stationary, ignition on, HV off",
    "safe_state_conditions": "Parking brake applied, 12 V > 12.4 V",
    "user_actions_required": "None — update performed by eVersum technician",
    "safety_security_confirmation": "Flashing via eVersum technician with SHA-256 check",
}


async def _ready(client, su, org_and_user):
    """Dokument, ki izpolnjuje vse pogoje za izdajo."""
    h = su["h"]
    d = await _doc(client, su, **COMPLETE)
    url = f"/api/v1/software-updates/{d['id']}"
    await client.post(f"{url}/rxswins", json={"rxswin_id": su["rx"]["id"], "baseline_after_id": su["b2"]}, headers=h)
    d = (await client.post(f"{url}/targets", json={"vehicle_ids": [su["v"][0]["id"], su["v"][1]["id"]]}, headers=h)).json()
    for t in d["targets"]:
        await client.put(f"{url}/targets/{t['id']}", json={"compatibility_confirmed": True}, headers=h)
    d = (await client.post(f"{url}/vv", json={"vv_status": "pass", "vv_method": "HIL test report TR-116"},
                           headers=org_and_user["qc_headers"])).json()
    return d


# ─── Ustvarjanje ──────────────────────────────────────────────────────────────

async def test_document_ids_are_sequential(client, su):
    d1 = await _doc(client, su)
    d2 = await _doc(client, su)
    year = datetime.now().year
    assert d1["document_id"] == f"SU-{year}-001" and d2["document_id"] == f"SU-{year}-002"
    assert d1["status"] == "draft" and d1["revision"] == 1


async def test_new_draft_lists_all_release_blockers(client, su):
    d = await _doc(client, su)
    assert set(d["release_blockers"]) >= {
        "no_rxswins", "vv_not_passed", "ta_decision", "execution_conditions",
        "safe_state_conditions", "user_actions", "safety_confirmation", "no_targets",
    }


async def test_affected_rxswin_records_before_and_after(client, su):
    d = await _doc(client, su)
    r = await client.post(f"/api/v1/software-updates/{d['id']}/rxswins",
                          json={"rxswin_id": su["rx"]["id"], "baseline_after_id": su["b2"]}, headers=su["h"])
    assert r.status_code == 201
    [a] = r.json()["affected_rxswins"]
    assert (a["rxswin"], a["baseline_before_number"], a["baseline_after_number"]) == ("VCUSWIN001", 1, 2)


async def test_targets_must_match_vehicle_type(client, su):
    d = await _doc(client, su)
    r = await client.post(f"/api/v1/software-updates/{d['id']}/targets",
                          json={"vehicle_ids": [su["v"][0]["id"], su["v"][2]["id"]]}, headers=su["h"])
    assert r.status_code == 422
    assert "VIN0000000000009" in r.json()["detail"]


# ─── Izdaja ───────────────────────────────────────────────────────────────────

async def test_release_blocked_returns_codes(client, su):
    d = await _doc(client, su)
    r = await client.post(f"/api/v1/software-updates/{d['id']}/release", headers=su["h"])
    assert r.status_code == 422
    assert "no_targets" in r.json()["detail"]["blockers"]


async def test_type_approval_needed_requires_grant(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    d = (await client.put(f"/api/v1/software-updates/{d['id']}",
                          json={"type_approval_update_necessary": True}, headers=su["h"])).json()
    assert d["release_blockers"] == ["ta_not_granted"]
    d = (await client.put(f"/api/v1/software-updates/{d['id']}", json={
        "type_approval_granted": True, "type_approval_number": "E1*156R00/00*0042", "type_approval_date": "2026-09-20",
    }, headers=su["h"])).json()
    assert d["release_blockers"] == []


async def test_full_release(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    assert d["release_blockers"] == []
    assert d["vv_signed_by_name"] == "Test QC Manager"
    r = await client.post(f"/api/v1/software-updates/{d['id']}/release", headers=su["h"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "released" and d["released_by_name"] == "Test Admin"
    logs = (await client.get("/api/v1/audit-logs", params={"entity_id": d["id"], "action": "release"}, headers=su["h"])).json()
    assert logs[0]["after"]["rxswins"] == ["VCUSWIN001 B1→B2"]
    assert sorted(logs[0]["after"]["targets"]) == ["VIN0000000000001", "VIN0000000000002"]


async def test_draft_rxswin_baseline_blocks_release(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    # odpri baseline 3 (draft) in ga uporabi kot ciljnega
    draft = (await client.post(f"/api/v1/rxswins/{su['rx']['id']}/baselines", json={}, headers=su["h"])).json()["baselines"][0]
    url = f"/api/v1/software-updates/{d['id']}"
    await client.delete(f"{url}/rxswins/{d['affected_rxswins'][0]['id']}", headers=su["h"])
    d = (await client.post(f"{url}/rxswins", json={"rxswin_id": su["rx"]["id"], "baseline_after_id": draft["id"]},
                           headers=su["h"])).json()
    assert d["release_blockers"] == ["baseline_not_released:VCUSWIN001"]


async def test_unconfirmed_target_blocks_release(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    t = d["targets"][0]
    d = (await client.put(f"/api/v1/software-updates/{d['id']}/targets/{t['id']}",
                          json={"compatibility_confirmed": False, "compatibility_notes": "HW rev too old"},
                          headers=su["h"])).json()
    assert d["release_blockers"] == ["targets_not_confirmed"]


async def test_technician_cannot_sign_or_release(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    th = org_and_user["tech_headers"]
    url = f"/api/v1/software-updates/{d['id']}"
    assert (await client.post(f"{url}/vv", json={"vv_status": "pass", "vv_method": "x"}, headers=th)).status_code == 403
    assert (await client.post(f"{url}/release", headers=th)).status_code == 403
    assert (await client.put(url, json={"title": "VCU 1.2.116 (tech edit)"}, headers=th)).status_code == 200


# ─── Po izdaji ────────────────────────────────────────────────────────────────

async def test_released_document_is_read_only_but_accepts_execution(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    url = f"/api/v1/software-updates/{d['id']}"
    await client.post(f"{url}/release", headers=su["h"])

    assert (await client.put(url, json={"title": "x"}, headers=su["h"])).status_code == 409
    assert (await client.post(f"{url}/targets", json={"vehicle_ids": [su["v"][0]["id"]]}, headers=su["h"])).status_code == 409
    assert (await client.delete(url, headers=su["h"])).status_code == 409

    t = d["targets"][0]
    r = await client.post(f"{url}/targets/{t['id']}/result", json={"result": "success"},
                          headers=org_and_user["tech_headers"])
    assert r.status_code == 200
    done = next(x for x in r.json()["targets"] if x["id"] == t["id"])
    assert done["result"] == "success" and done["applied_by_name"] == "Test Technician"

    n = await client.post(f"{url}/notification", json={"method": "E-mail to fleet manager"}, headers=su["h"])
    assert n.status_code == 200 and n.json()["user_notified_by_name"] == "Test Admin"


async def test_result_only_for_released(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    r = await client.post(f"/api/v1/software-updates/{d['id']}/targets/{d['targets'][0]['id']}/result",
                          json={"result": "success"}, headers=su["h"])
    assert r.status_code == 409


async def test_revision_supersedes_previous(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    await client.post(f"/api/v1/software-updates/{d['id']}/release", headers=su["h"])
    r = await client.post(f"/api/v1/software-updates/{d['id']}/revise", headers=su["h"])
    assert r.status_code == 201
    rev2 = r.json()
    assert rev2["revision"] == 2 and rev2["document_id"] == d["document_id"] and rev2["status"] == "draft"
    assert rev2["vv_status"] == "pending"
    assert all(not t["compatibility_confirmed"] for t in rev2["targets"])  # potrditve se ponovijo
    assert (await client.post(f"/api/v1/software-updates/{d['id']}/revise", headers=su["h"])).status_code == 409

    url = f"/api/v1/software-updates/{rev2['id']}"
    for t in rev2["targets"]:
        await client.put(f"{url}/targets/{t['id']}", json={"compatibility_confirmed": True}, headers=su["h"])
    await client.post(f"{url}/vv", json={"vv_status": "pass", "vv_method": "Regression"}, headers=su["h"])
    rel = await client.post(f"{url}/release", headers=su["h"])
    assert rel.status_code == 200, rel.text
    assert {r["revision"]: r["status"] for r in rel.json()["revisions"]} == {2: "released", 1: "superseded"}

    listed = (await client.get("/api/v1/software-updates", headers=su["h"])).json()
    assert [(x["document_id"], x["revision"]) for x in listed] == [(d["document_id"], 2)]


async def test_database_trigger_protects_released_document(client, su, org_and_user, test_engine):
    d = await _ready(client, su, org_and_user)
    await client.post(f"/api/v1/software-updates/{d['id']}/release", headers=su["h"])
    for sql in (
        "UPDATE software_updates SET title = 'hack'",
        "DELETE FROM software_updates",
        "UPDATE software_update_targets SET compatibility_confirmed = false",
        "DELETE FROM software_update_rxswins",
    ):
        with pytest.raises(Exception, match="samo za branje|zaklenjen|ni mogoče spreminjati"):
            async with test_engine.begin() as conn:
                await conn.execute(text(sql))
    # izvedba na vozilu je dovoljena tudi neposredno
    async with test_engine.begin() as conn:
        await conn.execute(text("UPDATE software_update_targets SET result = 'success', applied_at = now()"))


async def test_discard_draft(client, su):
    d = await _doc(client, su)
    assert (await client.delete(f"/api/v1/software-updates/{d['id']}", headers=su["h"])).status_code == 204
    assert (await client.get(f"/api/v1/software-updates/{d['id']}", headers=su["h"])).status_code == 404


# ─── PDF ──────────────────────────────────────────────────────────────────────

async def test_software_update_report_pdf(client, su, org_and_user):
    d = await _ready(client, su, org_and_user)
    r = await client.get(f"/api/v1/software-updates/{d['id']}/report.pdf", headers=su["h"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


async def test_readme_pdf(client, su):
    detail = (await client.get(f"/api/v1/rxswins/{su['rx']['id']}", headers=su["h"])).json()
    b = next(x for x in detail["baselines"] if x["id"] == su["b2"])
    r = await client.get(f"/api/v1/rxswin-baselines/{b['id']}/items/{b['items'][0]['id']}/readme.pdf", headers=su["h"])
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert "VCU%201.2.116%20-%20Readme.pdf" in r.headers["content-disposition"]


# ─── Vozila ───────────────────────────────────────────────────────────────────

async def test_duplicate_vin_rejected(client, su):
    r = await client.post("/api/v1/vehicles", json={
        "name": "dup", "model": "x", "year": 2025, "vin": "VIN0000000000001",
    }, headers=su["h"])
    assert r.status_code == 409


async def test_vehicles_filter_by_type(client, su):
    r = await client.get("/api/v1/vehicles", params={"vehicle_type_id": su["vt"]["id"]}, headers=su["h"])
    assert sorted(v["vin"] for v in r.json()) == ["VIN0000000000001", "VIN0000000000002"]
