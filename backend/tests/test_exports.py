"""Izvozi za organ / tehnično službo (R156 §7.1.1.12): register RXSWIN, revizijska sled, konfiguracije vozil."""
import csv
import io
from datetime import date, timedelta

from tests.test_su_documents import su  # noqa: F401 — fixtura


async def test_rxswin_register_pdf(client, su):
    r = await client.get("/api/v1/rxswin-register.pdf", params={"vehicle_type_id": su["vt"]["id"]}, headers=su["h"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf" and r.content[:4] == b"%PDF"


async def test_rxswin_register_pdf_other_org_type_404(client, su):
    import uuid
    r = await client.get("/api/v1/rxswin-register.pdf", params={"vehicle_type_id": str(uuid.uuid4())}, headers=su["h"])
    assert r.status_code == 404


async def test_audit_csv_matches_filters(client, su):
    r = await client.get("/api/v1/audit-logs/export.csv", params={"action": "release"}, headers=su["h"])
    assert r.status_code == 200
    rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert len(rows) == 2 and all(x["action"] == "release" for x in rows)       # baseline 1 in 2
    assert rows[0]["user"] == "Test Admin"
    count = (await client.get("/api/v1/audit-logs/count", params={"action": "release"}, headers=su["h"])).json()
    assert count["count"] == 2


async def test_audit_count_respects_dates(client, su):
    tomorrow = (date.today() + timedelta(days=2)).isoformat()
    r = await client.get("/api/v1/audit-logs/count", params={"from_date": tomorrow}, headers=su["h"])
    assert r.json()["count"] == 0


async def test_audit_csv_forbidden_for_technician(client, su, org_and_user):
    r = await client.get("/api/v1/audit-logs/export.csv", headers=org_and_user["tech_headers"])
    assert r.status_code == 403


async def test_vehicle_configurations_csv(client, su):
    v = su["v"][0]
    await client.post(f"/api/v1/vehicles/{v['id']}/configurations/eol", json={
        "rxswin_baselines": [{"rxswin_id": su["rx"]["id"], "baseline_id": su["b1"]}],
    }, headers=su["h"])
    r = await client.get("/api/v1/vehicle-configurations.csv", params={"vehicle_type_id": su["vt"]["id"]}, headers=su["h"])
    assert r.status_code == 200
    rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
    by_vin = {x["vin"]: x for x in rows}
    assert by_vin[v["vin"]]["rxswin"] == "VCUSWIN001" and by_vin[v["vin"]]["baseline"] == "1"
    assert by_vin[su["v"][1]["vin"]]["reason"] == "no configuration recorded"


async def test_sums_overview(client, su):
    d = (await client.post("/api/v1/software-updates", json={
        "vehicle_type_id": su["vt"]["id"], "title": "Draft SU", "description_purpose": "x",
    }, headers=su["h"])).json()
    await client.post(f"/api/v1/rxswins/{su['rx']['id']}/baselines", json={}, headers=su["h"])
    r = (await client.get("/api/v1/sums-overview", headers=su["h"])).json()
    assert r["counts"] == {"rxswins": 1, "released_baselines": 1, "released_updates": 0, "vehicles": 3}
    assert [x["document_id"] for x in r["su_drafts"]] == [d["document_id"]]
    assert [x["baseline_number"] for x in r["draft_baselines"]] == [3]
    assert len(r["vehicles_without_eol"]) == 3
    assert r["recent"][0]["user"] == "Test Admin"
    assert r["setup"] == {
        "vehicle_types": 2, "ecus": 1, "rxswins": 1, "released_baselines": 1, "vehicles": 3,
        "eol_configurations": 0, "released_updates": 0, "executed_updates": 0,
    }


async def test_audit_log_is_append_only(client, su, test_engine):
    import pytest
    from sqlalchemy import text
    for sql in ("UPDATE audit_logs SET action = 'x'", "DELETE FROM audit_logs"):
        with pytest.raises(Exception, match="samo za dodajanje"):
            async with test_engine.begin() as conn:
                await conn.execute(text(sql))


def test_csv_safe():
    from app.utils.audit import csv_safe
    assert csv_safe('=HYPERLINK("x")') == "'=HYPERLINK(\"x\")"
    assert csv_safe("@cmd") == "'@cmd" and csv_safe("VIN123") == "VIN123" and csv_safe(None) == ""
