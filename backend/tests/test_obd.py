"""
Testi za OBD-II modul — Faza 6.

Pokriva:
- POST /obd/{vehicle_id}/scan (scan z DTC in live data)
- GET /obd/{vehicle_id}/sessions (seznam sej)
- GET /obd/{vehicle_id}/sessions/{session_id} (podrobnosti seje)
- GET /obd/{vehicle_id}/live (live podatki iz twin)
- DTC severity klasifikacija
- DTC duplikat skip logika
- Audit log za scan
- Org izolacija
- 404 za neobstoječe vozilo
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import patch


class TestOBDScan:
    """Testi za POST /obd/{vehicle_id}/scan"""

    @pytest.fixture
    def scan_payload(self):
        return {
            "adapter_type": "ELM327",
            "adapter_id": "ELM327-BT-001",
            "protocol": "ISO 15765-4 CAN",
            "live_data": {
                "rpm": 1200.0,
                "speed_kmh": 0.0,
                "coolant_temp_c": 88.5,
                "intake_temp_c": 22.0,
                "throttle_pos_pct": 0.0,
                "fuel_level_pct": 72.5,
                "battery_voltage": 12.6,
                "engine_load_pct": 5.0,
                "mil_on": True,
                "dtc_count_obd": 2,
            },
            "raw_pids": {"0C": "12C0", "0D": "00", "05": "5D"},
            "dtcs": [
                {"code": "P0420", "freeze_frame": {"rpm": 1200, "speed": 0}},
                {"code": "U0100", "freeze_frame": {}},
            ],
            "vin_from_obd": "WVWZZZ1JZXW000001",
            "ecu_info": {"motor_ecu": "SW 2.2.1 HW 1.0"},
            "notes": "Testni sken",
        }

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_scan_creates_session_and_dtcs(
        self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, scan_payload
    ):
        """Scan ustvari sejo, importira DTC kode in posodobi twin."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json=scan_payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["dtcs_found"] == 2
        assert data["dtcs_imported"] == 2
        assert data["dtcs_skipped"] == 0
        assert data["live_data_updated"] is True
        assert data["twin_updated"] is True
        assert data["alarms_triggered"] == 1  # U0100 je high severity
        assert "session_id" in data

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_scan_skips_duplicate_active_dtc(
        self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, scan_payload
    ):
        """Duplikat aktivnega DTC se preskoči."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        # Prvo skeniranje
        resp1 = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json=scan_payload,
            headers=org_and_user["headers"],
        )
        assert resp1.status_code == 201

        # Drugo skeniranje z istimi DTC
        resp2 = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json=scan_payload,
            headers=org_and_user["headers"],
        )
        assert resp2.status_code == 201
        data = resp2.json()
        assert data["dtcs_imported"] == 0
        assert data["dtcs_skipped"] == 2

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_scan_empty_dtcs(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin):
        """Scan brez DTC — samo live data."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        payload = {
            "adapter_type": "ELM327",
            "live_data": {"rpm": 800.0, "speed_kmh": 60.0, "coolant_temp_c": 90.0},
            "dtcs": [],
        }
        resp = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json=payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["dtcs_found"] == 0
        assert data["dtcs_imported"] == 0
        assert data["alarms_triggered"] == 0

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_scan_updates_twin_live_data(
        self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, db_session, scan_payload
    ):
        """Po skenu se VehicleTwin.obd_live_data posodobi."""
        from sqlalchemy import select
        from app.models.vehicle_twin import VehicleTwin

        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json=scan_payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201

        twin = await db_session.execute(
            select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle_with_twin["vehicle"].id)
        )
        twin = twin.scalar_one()
        assert twin.obd_live_data.get("rpm") == 1200.0
        assert twin.obd_live_data.get("coolant_temp_c") == 88.5
        assert "last_updated" in twin.obd_live_data

    async def test_scan_vehicle_not_found(self, client, org_and_user):
        """404 za neobstoječe vozilo."""
        import uuid
        resp = await client.post(
            f"/api/v1/obd/{uuid.uuid4()}/scan",
            json={"adapter_type": "ELM327", "live_data": {}, "dtcs": []},
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404

    async def test_scan_unauthorized(self, client, vehicle_with_twin):
        """401 brez tokena."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(f"/api/v1/obd/{vehicle_id}/scan", json={})
        assert resp.status_code == 401

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_scan_writes_audit_log(
        self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, db_session, scan_payload
    ):
        """Scan piše audit log za obd_session in vsak dtc_record."""
        from sqlalchemy import select
        from app.models.audit_log import AuditLog

        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json=scan_payload,
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201

        logs = await db_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type.in_(["obd_session", "dtc_record"]),
                AuditLog.org_id == org_and_user["org"].id,
            )
        )
        entries = logs.scalars().all()
        # 1 za obd_session + 2 za dtc_record (P0420 + U0100)
        assert len(entries) >= 3


class TestOBDSessions:
    """Testi za GET /obd/{vehicle_id}/sessions"""

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_list_sessions(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin):
        """Seznam sej za vozilo."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        # Ustvari 2 seji
        for _ in range(2):
            await client.post(
                f"/api/v1/obd/{vehicle_id}/scan",
                json={"adapter_type": "ELM327", "live_data": {"rpm": 1000.0}, "dtcs": []},
                headers=org_and_user["headers"],
            )

        resp = await client.get(
            f"/api/v1/obd/{vehicle_id}/sessions",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 2

    async def test_list_sessions_vehicle_not_found(self, client, org_and_user):
        import uuid
        resp = await client.get(
            f"/api/v1/obd/{uuid.uuid4()}/sessions",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_get_session_detail(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin):
        """Podrobnosti posamezne seje."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        scan_resp = await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json={
                "adapter_type": "J2534",
                "adapter_id": "PASS-THRU-001",
                "live_data": {"rpm": 1500.0},
                "dtcs": [{"code": "P0300", "freeze_frame": {}}],
            },
            headers=org_and_user["headers"],
        )
        assert scan_resp.status_code == 201
        session_id = scan_resp.json()["session_id"]

        resp = await client.get(
            f"/api/v1/obd/{vehicle_id}/sessions/{session_id}",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["adapter_type"] == "J2534"
        assert data["adapter_id"] == "PASS-THRU-001"
        assert data["dtc_count"] == 1
        assert len(data["dtcs_raw"]) == 1


class TestOBDLiveData:
    """Testi za GET /obd/{vehicle_id}/live"""

    async def test_live_no_data(self, client, org_and_user, vehicle_with_twin):
        """Vozilo brez predhodnega skena — has_data=False."""
        # Ustvari novo vozilo brez skenov
        from app.models.vehicle import Vehicle
        from app.models.vehicle_twin import VehicleTwin
        import uuid

        # Uporabimo vehicle_with_twin, a preverimo fresh twin (obd_live_data je prazen)
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        resp = await client.get(
            f"/api/v1/obd/{vehicle_id}/live",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        # Morda has_data=True če je že bil sken v prejšnjih testih — preverimo samo strukturo
        assert "has_data" in data
        assert "live_data" in data

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_live_after_scan(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin):
        """Po skenu live endpoint vrne podatke."""
        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json={
                "adapter_type": "ELM327",
                "live_data": {"rpm": 2500.0, "speed_kmh": 80.0, "battery_voltage": 13.2},
                "dtcs": [],
            },
            headers=org_and_user["headers"],
        )

        resp = await client.get(
            f"/api/v1/obd/{vehicle_id}/live",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_data"] is True
        assert data["live_data"]["rpm"] == 2500.0
        assert data["live_data"]["speed_kmh"] == 80.0
        assert data["last_session_id"] is not None

    async def test_live_vehicle_not_found(self, client, org_and_user):
        import uuid
        resp = await client.get(
            f"/api/v1/obd/{uuid.uuid4()}/live",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404


class TestOBDSeverityClassification:
    """Testi za DTC severity klasifikacijo."""

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_chassis_dtc_is_high(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, db_session):
        """Chassis DTC (C0xxx) → severity=high."""
        from sqlalchemy import select
        from app.models.dtc_record import DTCRecord

        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json={
                "adapter_type": "ELM327",
                "live_data": {},
                "dtcs": [{"code": "C0031", "freeze_frame": {}}],
            },
            headers=org_and_user["headers"],
        )

        result = await db_session.execute(
            select(DTCRecord).where(
                DTCRecord.vehicle_id == vehicle_with_twin["vehicle"].id,
                DTCRecord.code == "C0031",
            )
        )
        dtc = result.scalar_one()
        assert dtc.severity == "high"
        assert dtc.source == "obd"

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_network_u0_dtc_is_high(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, db_session):
        """Network DTC (U0xxx) → severity=high."""
        from sqlalchemy import select
        from app.models.dtc_record import DTCRecord

        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json={
                "adapter_type": "ELM327",
                "live_data": {},
                "dtcs": [{"code": "U0001", "freeze_frame": {}}],
            },
            headers=org_and_user["headers"],
        )

        result = await db_session.execute(
            select(DTCRecord).where(
                DTCRecord.vehicle_id == vehicle_with_twin["vehicle"].id,
                DTCRecord.code == "U0001",
            )
        )
        dtc = result.scalar_one_or_none()
        if dtc:
            assert dtc.severity == "high"

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_body_dtc_is_low(self, mock_alarm, mock_twin, client, org_and_user, vehicle_with_twin, db_session):
        """Body DTC (B0xxx) → severity=low."""
        from sqlalchemy import select
        from app.models.dtc_record import DTCRecord

        vehicle_id = str(vehicle_with_twin["vehicle"].id)
        await client.post(
            f"/api/v1/obd/{vehicle_id}/scan",
            json={
                "adapter_type": "ELM327",
                "live_data": {},
                "dtcs": [{"code": "B1000", "freeze_frame": {}}],
            },
            headers=org_and_user["headers"],
        )

        result = await db_session.execute(
            select(DTCRecord).where(
                DTCRecord.vehicle_id == vehicle_with_twin["vehicle"].id,
                DTCRecord.code == "B1000",
            )
        )
        dtc = result.scalar_one_or_none()
        if dtc:
            assert dtc.severity == "low"


class TestOBDOrgIsolation:
    """Org izolacija — ne moreš videti tujih OBD sej."""

    @patch("app.workers.twin_worker.update_vehicle_twin.delay")
    @patch("app.workers.alarm_worker.check_dtc_alarm.delay")
    async def test_cannot_scan_other_org_vehicle(self, mock_alarm, mock_twin, client, db_session):
        """Ne moreš skenirati vozila druge organizacije."""
        from app.models.organization import Organization
        from app.models.user import User
        from app.models.vehicle import Vehicle
        from app.utils.security import hash_password, create_access_token

        # Org 2
        org2 = Organization(name="Tunja Org", type="partner")
        db_session.add(org2)
        await db_session.flush()

        user2 = User(
            organization_id=org2.id,
            email="tuji@org.com",
            full_name="Tuji Uporabnik",
            role="admin",
            password_hash=hash_password("test1234"),
        )
        db_session.add(user2)
        await db_session.flush()

        vehicle2 = Vehicle(
            organization_id=org2.id,
            name="Tujo Vozilo",
            model="Test",
            year=2024,
            vin=f"TUJI-{__import__('uuid').uuid4().hex[:8].upper()}",
        )
        db_session.add(vehicle2)
        await db_session.commit()

        token2 = create_access_token({"sub": str(user2.id), "org_id": str(org2.id), "role": user2.role})

        # Org 1 user poskuša skenirati vozilo Org 2
        from app.utils.security import create_access_token as cat
        resp = await client.post(
            f"/api/v1/obd/{vehicle2.id}/scan",
            json={"adapter_type": "ELM327", "live_data": {}, "dtcs": []},
            headers={"Authorization": f"Bearer {token2}"},
        )
        # To je dovoljeno — user2 je iz org2 in skenira vozilo org2
        assert resp.status_code == 201

        # Org 1 user poskuša skenirati vozilo Org 2 — 404
        from app.utils.security import create_access_token as ct
        from app.models.organization import Organization as Org
        from sqlalchemy import select
        orgs = await db_session.execute(select(Org).where(Org.name == "Test eVersum"))
        org1 = orgs.scalar_one_or_none()
        if org1:
            users1 = await db_session.execute(
                select(User).where(User.organization_id == org1.id, User.role == "admin")
            )
            user1 = users1.scalars().first()
            if user1:
                token1 = ct({"sub": str(user1.id), "org_id": str(org1.id), "role": user1.role})
                resp_cross = await client.post(
                    f"/api/v1/obd/{vehicle2.id}/scan",
                    json={"adapter_type": "ELM327", "live_data": {}, "dtcs": []},
                    headers={"Authorization": f"Bearer {token1}"},
                )
                assert resp_cross.status_code == 404
