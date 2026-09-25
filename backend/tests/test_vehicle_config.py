"""
Testi za konfiguracijo vozila (R156 §7.1.2.2, §7.1.1.7) in ERP integracijo.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.test_su_documents import COMPLETE, su  # noqa: F401 — fixtura


async def _eol(client, su, vehicle, baseline_id):
    return await client.post(f"/api/v1/vehicles/{vehicle['id']}/configurations/eol", json={
        "rxswin_baselines": [{"rxswin_id": su["rx"]["id"], "baseline_id": baseline_id}],
        "system_schemes_baseline": "SSB-ES03-11", "erp_work_order": "WO-0001",
    }, headers=su["h"])


async def test_eol_configuration_snapshot(client, su):
    v = su["v"][0]
    r = await _eol(client, su, v, su["b1"])
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["has_eol"] and d["current"]["config_type"] == "initial_eol"
    assert d["current"]["config_id"] == f"EOL-{v['vin']}"
    [rx] = d["current"]["snapshot"]["rxswins"]
    assert rx["rxswin"] == "VCUSWIN001" and rx["baseline_number"] == 1
    assert rx["items"][0]["sw_version"] == "1.2.115"
    # druga EOL ni dovoljena
    assert (await _eol(client, su, v, su["b1"])).status_code == 409


async def test_eol_requires_released_baseline(client, su):
    draft = (await client.post(f"/api/v1/rxswins/{su['rx']['id']}/baselines", json={}, headers=su["h"])).json()["baselines"][0]
    r = await _eol(client, su, su["v"][0], draft["id"])
    assert r.status_code == 422


async def test_ecu_instance_change_creates_new_last_known(client, su):
    v = su["v"][0]
    await _eol(client, su, v, su["b1"])
    r = await client.put(f"/api/v1/vehicles/{v['id']}/ecu-instances", json={"instances": [
        {"ecu_id": su["ecu"]["id"], "serial_number": "N6200012501301", "hardware_version": "v.1.3", "batch_number": "7009"},
    ]}, headers=su["h"])
    assert r.status_code == 200
    d = r.json()
    assert d["ecu_instances"][0]["serial_number"] == "N6200012501301"
    assert [c["config_type"] for c in d["history"]] == ["last_known", "initial_eol"]
    assert d["current"]["reason"] == "ECU hardware change: Vehicle Control Unit"
    assert d["current"]["snapshot"]["ecus"][0]["hardware_version"] == "v.1.3"
    # EOL posnetek ostane nespremenjen (brez ECU instanc)
    assert d["history"][1]["snapshot"]["ecus"] == []
    # enaki podatki drugič = brez nove konfiguracije
    again = await client.put(f"/api/v1/vehicles/{v['id']}/ecu-instances", json={"instances": [
        {"ecu_id": su["ecu"]["id"], "serial_number": "N6200012501301", "hardware_version": "v.1.3", "batch_number": "7009"},
    ]}, headers=su["h"])
    assert len(again.json()["history"]) == 2


async def test_successful_update_creates_last_known_and_precondition(client, su, org_and_user):
    from tests.test_su_documents import _ready

    v1, v2 = su["v"][0], su["v"][1]
    await _eol(client, su, v1, su["b1"])       # v1: pričakovano stanje (B1)
    await _eol(client, su, v2, su["b2"])       # v2: že ima B2
    d = await _ready(client, su, org_and_user)
    pre = {t["vin"]: t["precondition"] for t in d["targets"]}
    assert pre == {v1["vin"]: "ok", v2["vin"]: "already_installed"}

    url = f"/api/v1/software-updates/{d['id']}"
    await client.post(f"{url}/release", headers=su["h"])
    t1 = next(t for t in d["targets"] if t["vin"] == v1["vin"])
    r = await client.post(f"{url}/targets/{t1['id']}/result", json={"result": "success"}, headers=su["h"])
    assert r.status_code == 200
    # izvedba se ne prepiše
    assert (await client.post(f"{url}/targets/{t1['id']}/result", json={"result": "failed"}, headers=su["h"])).status_code == 409

    cfg = (await client.get(f"/api/v1/vehicles/{v1['id']}/r156", headers=su["h"])).json()
    assert cfg["current"]["config_type"] == "last_known"
    assert cfg["current"]["reason"] == f"{d['document_id']} rev. 1"
    assert cfg["current"]["software_update_id"] == d["id"]
    assert cfg["current"]["snapshot"]["rxswins"][0]["baseline_number"] == 2
    assert cfg["current"]["system_schemes_baseline"] == "SSB-ES03-11"   # prenese se iz EOL


async def test_failed_update_keeps_configuration(client, su, org_and_user):
    from tests.test_su_documents import _ready

    v1 = su["v"][0]
    await _eol(client, su, v1, su["b1"])
    d = await _ready(client, su, org_and_user)
    url = f"/api/v1/software-updates/{d['id']}"
    await client.post(f"{url}/release", headers=su["h"])
    t1 = next(t for t in d["targets"] if t["vin"] == v1["vin"])
    await client.post(f"{url}/targets/{t1['id']}/result", json={"result": "failed"}, headers=su["h"])
    cfg = (await client.get(f"/api/v1/vehicles/{v1['id']}/r156", headers=su["h"])).json()
    assert len(cfg["history"]) == 1 and cfg["current"]["config_type"] == "initial_eol"


async def test_mismatch_precondition(client, su):
    """Vozilo je iz EOL še na B1, posodobitev pa predvideva prehod B2 → B3."""
    d3 = (await client.post(f"/api/v1/rxswins/{su['rx']['id']}/baselines", json={}, headers=su["h"])).json()["baselines"][0]
    await client.post(f"/api/v1/rxswin-baselines/{d3['id']}/release", headers=su["h"])
    await _eol(client, su, su["v"][0], su["b1"])
    doc = (await client.post("/api/v1/software-updates", json={
        "vehicle_type_id": su["vt"]["id"], "title": "VCU B3", "description_purpose": "x",
    }, headers=su["h"])).json()
    url = f"/api/v1/software-updates/{doc['id']}"
    await client.post(f"{url}/rxswins", json={"rxswin_id": su["rx"]["id"], "baseline_after_id": d3["id"]}, headers=su["h"])
    d = (await client.post(f"{url}/targets", json={"vehicle_ids": [su["v"][0]["id"], su["v"][1]["id"]]},
                           headers=su["h"])).json()
    by_vin = {t["vin"]: t for t in d["targets"]}
    assert by_vin[su["v"][0]["vin"]]["precondition"] == "mismatch"
    assert by_vin[su["v"][0]["vin"]]["precondition_detail"] == ["VCUSWIN001: B1 / B2"]
    assert by_vin[su["v"][1]["vin"]]["precondition"] == "unknown"   # brez zapisane konfiguracije


async def test_configuration_is_immutable_in_database(client, su, test_engine):
    await _eol(client, su, su["v"][0], su["b1"])
    for sql in ("UPDATE vehicle_configurations SET reason = 'hack'", "DELETE FROM vehicle_configurations"):
        with pytest.raises(Exception, match="nespremenljiva"):
            async with test_engine.begin() as conn:
                await conn.execute(text(sql))


# ─── ERP integracija ──────────────────────────────────────────────────────────

@pytest.fixture
def erp_key(monkeypatch, org_and_user):
    from app.config import settings
    monkeypatch.setattr(settings, "erp_api_key", "test-erp-key-0123456789")
    monkeypatch.setattr(settings, "erp_org_name", org_and_user["org"].name)
    return "test-erp-key-0123456789"


async def test_erp_reads_last_known_configuration(client, su, erp_key):
    v = su["v"][0]
    await _eol(client, su, v, su["b1"])
    r = await client.get(f"/api/v1/integration/vehicles/{v['vin'].lower()}/last-known-configuration",
                         headers={"X-API-Key": erp_key})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["vin"] == v["vin"] and d["config_id"] == f"EOL-{v['vin']}"
    assert d["rxswins"][0]["items"][0]["sw_file_sha256"]
    assert d["erp_work_order"] == "WO-0001"


async def test_erp_rejects_wrong_key_and_unknown_vin(client, su, erp_key):
    v = su["v"][0]
    await _eol(client, su, v, su["b1"])
    url = f"/api/v1/integration/vehicles/{v['vin']}/last-known-configuration"
    assert (await client.get(url, headers={"X-API-Key": "napacen"})).status_code == 401
    assert (await client.get(url)).status_code == 401
    assert (await client.get("/api/v1/integration/vehicles/NEOBSTAJA/last-known-configuration",
                             headers={"X-API-Key": erp_key})).status_code == 404
    # z JWT prijavljenega uporabnika deluje tudi brez ključa
    assert (await client.get(url, headers=su["h"])).status_code == 200


async def test_erp_disabled_without_key(client, su, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "erp_api_key", "")
    r = await client.get(f"/api/v1/integration/vehicles/{su['v'][0]['vin']}/last-known-configuration",
                         headers={"X-API-Key": "karkoli"})
    assert r.status_code == 401
