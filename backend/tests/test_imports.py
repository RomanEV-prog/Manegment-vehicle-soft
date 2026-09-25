"""Uvoz iz CSV (selitev): vozila in postavke baseline-a — predogled, vse-ali-nič, revizijska sled."""
import hashlib

from tests.test_su_documents import su  # noqa: F401 — fixtura

SHA = hashlib.sha256(b"import").hexdigest()


async def test_vehicle_import_preview_then_create(client, su):
    rows = [
        {"vin": "wev0es03000000901", "name": "Shuttle 9", "year": 2025},
        {"vin": "WEV0ES03000000902"},
        {"vin": "VIN0000000000001"},            # že obstaja (fixtura)
    ]
    body = {"vehicle_type_id": su["vt"]["id"], "rows": rows}
    preview = (await client.post("/api/v1/vehicle-import", json={**body, "dry_run": True}, headers=su["h"])).json()
    assert preview["to_create"] == ["WEV0ES03000000901", "WEV0ES03000000902"]
    assert preview["skipped_existing"] == ["VIN0000000000001"] and preview["created"] == 0
    listed = (await client.get("/api/v1/vehicles", params={"vehicle_type_id": su["vt"]["id"]}, headers=su["h"])).json()
    assert len(listed) == 2                     # predogled ne zapiše ničesar

    done = (await client.post("/api/v1/vehicle-import", json={**body, "dry_run": False}, headers=su["h"])).json()
    assert done["created"] == 2
    listed = (await client.get("/api/v1/vehicles", params={"vehicle_type_id": su["vt"]["id"]}, headers=su["h"])).json()
    assert {v["vin"] for v in listed} >= {"WEV0ES03000000901", "WEV0ES03000000902"}
    logs = (await client.get("/api/v1/audit-logs", params={"action": "import"}, headers=su["h"])).json()
    assert logs[0]["after"]["created"] == ["WEV0ES03000000901", "WEV0ES03000000902"]


async def test_vehicle_import_all_or_nothing(client, su):
    rows = [{"vin": "WEV0ES03000000903"}, {"vin": "BAD VIN"}, {"vin": "WEV0ES03000000903"}]
    r = (await client.post("/api/v1/vehicle-import", json={
        "vehicle_type_id": su["vt"]["id"], "rows": rows, "dry_run": False}, headers=su["h"])).json()
    assert r["created"] == 0 and {e["row"] for e in r["errors"]} == {2, 3}
    listed = (await client.get("/api/v1/vehicles", params={"vehicle_type_id": su["vt"]["id"]}, headers=su["h"])).json()
    assert "WEV0ES03000000903" not in {v["vin"] for v in listed}


async def test_vehicle_import_forbidden_for_partner(client, su, org_and_user):
    r = await client.post("/api/v1/vehicle-import", json={
        "vehicle_type_id": su["vt"]["id"], "rows": [{"vin": "WEV0ES03000000904"}]}, headers=org_and_user["partner_headers"])
    assert r.status_code == 403


async def test_baseline_item_import(client, su):
    draft = (await client.post(f"/api/v1/rxswins/{su['rx']['id']}/baselines", json={}, headers=su["h"])).json()["baselines"][0]
    url = f"/api/v1/rxswin-baselines/{draft['id']}/items/import"
    rows = [{"ecu": "EV-00000-41817", "sw_version": "1.2.117", "sw_file_sha256": SHA.upper(),
             "compatible_hardware": "927889/TTC-500", "egnyte_folder_url": "https://evision.egnyte.com/vcu"}]
    preview = (await client.post(url, json={"rows": rows}, headers=su["h"])).json()
    assert preview["plan"] == [{"ecu": "Vehicle Control Unit", "action": "update", "sw_version": "1.2.117"}]
    done = (await client.post(url, json={"rows": rows, "dry_run": False}, headers=su["h"])).json()
    assert done["applied"] == 1
    detail = (await client.get(f"/api/v1/rxswins/{su['rx']['id']}", headers=su["h"])).json()
    item = next(b for b in detail["baselines"] if b["id"] == draft["id"])["items"][0]
    assert item["sw_version"] == "1.2.117" and item["sw_file_sha256"] == SHA and item["sha_valid"]


async def test_baseline_item_import_validates_rows(client, su):
    draft = (await client.post(f"/api/v1/rxswins/{su['rx']['id']}/baselines", json={}, headers=su["h"])).json()["baselines"][0]
    rows = [
        {"ecu": "Neobstoječ ECU", "sw_version": "1"},
        {"ecu": "Vehicle Control Unit", "sw_version": "1", "sw_file_sha256": "d7f66a732e4b1f.."},
        {"ecu": "Vehicle Control Unit", "sw_version": "1", "egnyte_folder_url": "javascript:alert(1)"},
    ]
    r = (await client.post(f"/api/v1/rxswin-baselines/{draft['id']}/items/import",
                           json={"rows": rows, "dry_run": False}, headers=su["h"])).json()
    assert r["applied"] == 0 and [e["row"] for e in r["errors"]] == [1, 2, 3]


async def test_baseline_item_import_only_into_draft(client, su):
    r = await client.post(f"/api/v1/rxswin-baselines/{su['b2']}/items/import",
                          json={"rows": [{"ecu": "Vehicle Control Unit", "sw_version": "x"}]}, headers=su["h"])
    assert r.status_code == 409
