"""
Testi za Digital Twin — /api/v1/vehicles/{id}/twin, snapshots
"""
from datetime import date
import pytest
from httpx import AsyncClient


class TestVehicleTwin:
    async def test_get_twin_structure(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle = vehicle_with_twin["vehicle"]
        resp = await client.get(
            f"/api/v1/vehicles/{vehicle.id}/twin",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["vehicle_id"] == str(vehicle.id)
        assert "ecu_config" in data
        assert "hom_status" in data
        assert "active_dtcs" in data

    async def test_twin_not_found_wrong_vehicle(self, client: AsyncClient, org_and_user):
        import uuid
        resp = await client.get(
            f"/api/v1/vehicles/{uuid.uuid4()}/twin",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 404


class TestTwinSnapshot:
    async def test_manual_snapshot(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle = vehicle_with_twin["vehicle"]
        resp = await client.post(
            f"/api/v1/vehicles/{vehicle.id}/snapshot",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["trigger_type"] == "manual"
        assert data["vehicle_id"] == str(vehicle.id)
        assert "snapshot" in data

    async def test_snapshot_history(self, client: AsyncClient, org_and_user, vehicle_with_twin):
        vehicle = vehicle_with_twin["vehicle"]
        for _ in range(3):
            await client.post(
                f"/api/v1/vehicles/{vehicle.id}/snapshot",
                headers=org_and_user["headers"],
            )

        resp = await client.get(
            f"/api/v1/vehicles/{vehicle.id}/snapshots",
            headers=org_and_user["headers"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) >= 3

    async def test_snapshot_immutable(self, db_session, org_and_user, vehicle_with_twin):
        """Snapshot se ne sme spremeniti po kreiranju — nespremenljiva historia."""
        from sqlalchemy import select
        from app.models.twin_snapshot import TwinSnapshot

        vehicle = vehicle_with_twin["vehicle"]
        snapshot_data = {"ecu_config": {"motor": {"version": "1.0.0"}}, "test": True}

        snap = TwinSnapshot(
            vehicle_id=vehicle.id,
            organization_id=org_and_user["org"].id,
            snapshot=snapshot_data,
            trigger_type="manual",
            trigger_label="Test snapshot",
        )
        db_session.add(snap)
        await db_session.commit()
        snap_id = snap.id

        result = await db_session.execute(select(TwinSnapshot).where(TwinSnapshot.id == snap_id))
        fetched = result.scalar_one()

        assert fetched.snapshot == snapshot_data
        assert not hasattr(fetched, "updated_at") or fetched.updated_at is None

    async def test_twin_reflects_sw_update(self, db_session, org_and_user, vehicle_with_twin):
        """Po SW posodobitvi mora twin.ecu_config odražati novo verzijo."""
        from app.models.sw_update import SWUpdate
        from app.models.vehicle_twin import VehicleTwin
        from sqlalchemy import select

        vehicle = vehicle_with_twin["vehicle"]

        sw = SWUpdate(
            vehicle_id=vehicle.id,
            organization_id=org_and_user["org"].id,
            date=date.today(),
            ecu_module="motor_ecu",
            version_before="2.1.0",
            version_after="2.2.1",
            rxswin="RXSWIN-EV-M1-221",
            method="OTA",
            status="success",
        )
        db_session.add(sw)
        await db_session.commit()

        # Ročno posodobi twin (kar naredi twin_worker)
        result = await db_session.execute(
            select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle.id)
        )
        twin = result.scalar_one()
        twin.ecu_config["motor_ecu"] = {
            "version": sw.version_after,
            "rxswin": sw.rxswin,
            "updated_at": sw.date.isoformat(),
        }
        await db_session.commit()

        result = await db_session.execute(
            select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle.id)
        )
        twin = result.scalar_one()
        assert twin.ecu_config["motor_ecu"]["version"] == "2.2.1"
        assert twin.ecu_config["motor_ecu"]["rxswin"] == "RXSWIN-EV-M1-221"
