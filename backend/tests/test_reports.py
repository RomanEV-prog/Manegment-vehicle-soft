"""
Testi za poročila — /api/v1/reports/*
"""
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_fleet_status_empty(client: AsyncClient, org_and_user):
    """Fleet status brez vozil — prazen summary."""
    resp = await client.get(
        "/api/v1/reports/fleet-status",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "summary" in data
    assert "vehicles" in data
    assert "generated_at" in data
    assert data["summary"]["total_vehicles"] >= 0


@pytest.mark.asyncio
async def test_fleet_status_with_vehicle(client: AsyncClient, org_and_user, vehicle_with_twin):
    """Fleet status z vozilom — prikazano v listi."""
    resp = await client.get(
        "/api/v1/reports/fleet-status",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["total_vehicles"] >= 1
    vehicle_ids = [v["id"] for v in data["vehicles"]]
    assert str(vehicle_with_twin["vehicle"].id) in vehicle_ids


@pytest.mark.asyncio
async def test_fleet_status_vehicle_fields(client: AsyncClient, org_and_user, vehicle_with_twin):
    """Vsako vozilo v fleet statusu ima obvezna polja."""
    resp = await client.get(
        "/api/v1/reports/fleet-status",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    for v in resp.json()["vehicles"]:
        assert "id" in v
        assert "name" in v
        assert "vin" in v
        assert "status" in v
        assert "active_dtc_count" in v
        assert "ecu_modules" in v


@pytest.mark.asyncio
async def test_fleet_status_unauthorized(client: AsyncClient):
    """Brez tokena → 401."""
    resp = await client.get("/api/v1/reports/fleet-status")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_sums_report_no_vehicle_id(client: AsyncClient, org_and_user):
    """SUMS brez vehicle_id → 422."""
    resp = await client.get(
        "/api/v1/reports/sums",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sums_report_unknown_vehicle(client: AsyncClient, org_and_user):
    """SUMS z neobstoječim vozilom → 404."""
    import uuid
    with patch(
        "app.services.report_service.generate_sums_pdf",
        new_callable=AsyncMock,
        side_effect=ValueError("Vozilo ne obstaja"),
    ):
        resp = await client.get(
            "/api/v1/reports/sums",
            params={"vehicle_id": str(uuid.uuid4())},
            headers=org_and_user["headers"],
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sums_report_pdf(client: AsyncClient, org_and_user, vehicle_with_twin):
    """SUMS PDF — vrne application/pdf."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    fake_pdf = b"%PDF-1.4 fake content"
    with patch(
        "app.services.report_service.generate_sums_pdf",
        new_callable=AsyncMock,
        return_value=fake_pdf,
    ):
        resp = await client.get(
            "/api/v1/reports/sums",
            params={"vehicle_id": vehicle_id, "format": "pdf"},
            headers=org_and_user["headers"],
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert b"%PDF" in resp.content


@pytest.mark.asyncio
async def test_sums_report_html(client: AsyncClient, org_and_user, vehicle_with_twin):
    """SUMS HTML — vrne text/html."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    fake_html = b"<html><body>SUMS Report</body></html>"
    with patch(
        "app.services.report_service.generate_sums_pdf",
        new_callable=AsyncMock,
        return_value=fake_html,
    ):
        resp = await client.get(
            "/api/v1/reports/sums",
            params={"vehicle_id": vehicle_id, "format": "html"},
            headers=org_and_user["headers"],
        )
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_hom_overview_no_vehicle_id(client: AsyncClient, org_and_user):
    """HOM overview brez vehicle_id → 400."""
    resp = await client.get(
        "/api/v1/reports/hom-overview",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_hom_overview_unknown_vehicle(client: AsyncClient, org_and_user):
    """HOM overview z neobstoječim vozilom → 404."""
    import uuid
    with patch(
        "app.services.report_service.generate_hom_report_pdf",
        new_callable=AsyncMock,
        side_effect=ValueError("Vozilo ne obstaja"),
    ):
        resp = await client.get(
            "/api/v1/reports/hom-overview",
            params={"vehicle_id": str(uuid.uuid4())},
            headers=org_and_user["headers"],
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_hom_overview_pdf(client: AsyncClient, org_and_user, vehicle_with_twin):
    """HOM overview PDF — vrne application/pdf."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)
    fake_pdf = b"%PDF-1.4 hom report"
    with patch(
        "app.services.report_service.generate_hom_report_pdf",
        new_callable=AsyncMock,
        return_value=fake_pdf,
    ):
        resp = await client.get(
            "/api/v1/reports/hom-overview",
            params={"vehicle_id": vehicle_id, "format": "pdf"},
            headers=org_and_user["headers"],
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


# ─── CSV Izvoz ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sw_updates_csv_empty(client: AsyncClient, org_and_user):
    """SW CSV brez zapisov — 200 z BOM headerjem."""
    resp = await client.get(
        "/api/v1/reports/sw-updates-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    # UTF-8 BOM na začetku
    assert resp.content[:3] == b"\xef\xbb\xbf"


@pytest.mark.asyncio
async def test_sw_updates_csv_with_data(client: AsyncClient, org_and_user, vehicle_with_twin):
    """SW CSV z zapisom — vsebuje glavo in vrstico podatkov."""
    from datetime import date

    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/sw-updates", json={
        "vehicle_id": str(vehicle.id),
        "date": str(date.today()),
        "ecu_module": "CSV Test ECU",
        "version_before": "1.0",
        "version_after": "1.1",
        "rxswin": "RXSWIN-CSV-T1-001",
        "method": "Workshop",
        "status": "success",
    }, headers=org_and_user["headers"])

    resp = await client.get(
        "/api/v1/reports/sw-updates-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "Datum" in content
    assert "CSV Test ECU" in content
    assert "RXSWIN-CSV-T1-001" in content


@pytest.mark.asyncio
async def test_sw_updates_csv_filter_by_vehicle(client: AsyncClient, org_and_user, vehicle_with_twin):
    """SW CSV filtrirano po vehicle_id."""
    vehicle_id = str(vehicle_with_twin["vehicle"].id)

    resp = await client.get(
        f"/api/v1/reports/sw-updates-csv?vehicle_id={vehicle_id}",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_dtc_records_csv_empty(client: AsyncClient, org_and_user):
    """DTC CSV brez zapisov — 200 z BOM."""
    resp = await client.get(
        "/api/v1/reports/dtc-records-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert resp.content[:3] == b"\xef\xbb\xbf"


@pytest.mark.asyncio
async def test_dtc_records_csv_with_data(client: AsyncClient, org_and_user, vehicle_with_twin):
    """DTC CSV z zapisom — vsebuje glavo in vrstico podatkov."""
    from datetime import datetime, timezone

    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/dtc-records", json={
        "vehicle_id": str(vehicle.id),
        "code": "P0700",
        "description": "CSV test DTC",
        "severity": "high",
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "source": "manual",
    }, headers=org_and_user["headers"])

    resp = await client.get(
        "/api/v1/reports/dtc-records-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "Zaznano" in content
    assert "P0700" in content
    assert "CSV test DTC" in content


@pytest.mark.asyncio
async def test_dtc_records_csv_filter_by_status(client: AsyncClient, org_and_user, vehicle_with_twin):
    """DTC CSV filtrirano po statusu."""
    resp = await client.get(
        "/api/v1/reports/dtc-records-csv?status=active",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_homologations_csv_empty(client: AsyncClient, org_and_user):
    """Homologacij CSV brez zapisov — 200 z BOM."""
    resp = await client.get(
        "/api/v1/reports/homologations-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert resp.content[:3] == b"\xef\xbb\xbf"


@pytest.mark.asyncio
async def test_homologations_csv_with_data(client: AsyncClient, org_and_user, vehicle_with_twin):
    """Homologacij CSV z zapisom — vsebuje glavo in podatke."""
    from datetime import date

    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/homologations", json={
        "vehicle_id": str(vehicle.id),
        "regulation": "UNECE R156",
        "status": "pending",
        "country": "SI",
        "authority": "AVV",
        "valid_from": str(date.today()),
    }, headers=org_and_user["headers"])

    resp = await client.get(
        "/api/v1/reports/homologations-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "Uredba" in content
    assert "UNECE R156" in content


@pytest.mark.asyncio
async def test_csv_unauthorized(client: AsyncClient):
    """CSV izvoz brez tokena → 401."""
    for endpoint in [
        "/api/v1/reports/sw-updates-csv",
        "/api/v1/reports/dtc-records-csv",
        "/api/v1/reports/homologations-csv",
        "/api/v1/reports/service-records-csv",
    ]:
        resp = await client.get(endpoint)
        assert resp.status_code == 401, f"Pričakovan 401 za {endpoint}"


# ─── Service Records CSV ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_service_records_csv_empty(client: AsyncClient, org_and_user):
    """Service records CSV brez zapisov — 200 z BOM."""
    resp = await client.get(
        "/api/v1/reports/service-records-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert resp.content[:3] == b"\xef\xbb\xbf"


@pytest.mark.asyncio
async def test_service_records_csv_with_data(client: AsyncClient, org_and_user, vehicle_with_twin):
    """Service records CSV z zapisom — vsebuje glavo in podatke."""
    from datetime import date

    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": str(date.today()),
        "service_type": "maintenance",
        "technician": "CSV Tehnik",
        "items": ["Menjava olja", "Filter zraka"],
    }, headers=org_and_user["headers"])

    resp = await client.get(
        "/api/v1/reports/service-records-csv",
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "Datum" in content
    assert "CSV Tehnik" in content
    assert "Menjava olja" in content


@pytest.mark.asyncio
async def test_service_records_csv_filter_by_vehicle(client: AsyncClient, org_and_user, vehicle_with_twin):
    """Service records CSV filtrirano po vehicle_id."""
    from datetime import date
    import uuid

    vehicle = vehicle_with_twin["vehicle"]
    await client.post("/api/v1/service-records", json={
        "vehicle_id": str(vehicle.id),
        "date": str(date.today()),
        "service_type": "inspection",
        "technician": "Filter Tehnik",
        "items": ["Pregled"],
    }, headers=org_and_user["headers"])

    resp = await client.get(
        "/api/v1/reports/service-records-csv",
        params={"vehicle_id": str(vehicle.id)},
        headers=org_and_user["headers"],
    )
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "Filter Tehnik" in content

    # Napačen vehicle_id — prazen CSV
    resp_empty = await client.get(
        "/api/v1/reports/service-records-csv",
        params={"vehicle_id": str(uuid.uuid4())},
        headers=org_and_user["headers"],
    )
    assert resp_empty.status_code == 200
    content_empty = resp_empty.content.decode("utf-8-sig")
    assert "Filter Tehnik" not in content_empty
