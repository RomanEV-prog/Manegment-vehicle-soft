import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ─── Live Data (PID vrednosti) ────────────────────────────────────────────────

class OBDLiveData(BaseModel):
    """Standard OBD-II Mode 01 PID vrednosti."""
    rpm: float | None = Field(None, description="Engine RPM (PID 0x0C)")
    speed_kmh: float | None = Field(None, description="Vehicle speed km/h (PID 0x0D)")
    coolant_temp_c: float | None = Field(None, description="Coolant temperature °C (PID 0x05)")
    intake_temp_c: float | None = Field(None, description="Intake air temperature °C (PID 0x0F)")
    throttle_pos_pct: float | None = Field(None, description="Throttle position % (PID 0x11)")
    fuel_level_pct: float | None = Field(None, description="Fuel tank level % (PID 0x2F)")
    engine_load_pct: float | None = Field(None, description="Engine load % (PID 0x04)")
    battery_voltage: float | None = Field(None, description="Control module voltage V (PID 0x42)")
    maf_g_per_sec: float | None = Field(None, description="MAF air flow rate g/s (PID 0x10)")
    fuel_pressure_kpa: float | None = Field(None, description="Fuel pressure kPa (PID 0x0A)")
    barometric_pressure_kpa: float | None = Field(None, description="Barometric pressure kPa (PID 0x33)")
    o2_sensor_voltage: float | None = Field(None, description="O2 sensor voltage V (PID 0x14)")
    distance_since_dtc_clear_km: int | None = Field(None, description="Distance since DTC cleared km (PID 0x31)")
    runtime_since_start_s: int | None = Field(None, description="Run time since engine start s (PID 0x1F)")
    mil_on: bool | None = Field(None, description="MIL (check engine light) status (PID 0x01 bit)")
    dtc_count_obd: int | None = Field(None, description="Number of DTCs reported by OBD (PID 0x01)")
    extra: dict[str, Any] = Field(default_factory=dict, description="Dodatni PID podatki")


# ─── DTC iz OBD ──────────────────────────────────────────────────────────────

class OBDRawDTC(BaseModel):
    code: str = Field(..., description="DTC koda npr. P0420, U0100")
    freeze_frame: dict[str, Any] = Field(default_factory=dict, description="Freeze frame ob zaznavi")


# ─── Scan Request ─────────────────────────────────────────────────────────────

class OBDScanRequest(BaseModel):
    adapter_type: str = Field("ELM327", description="Tip adapterja: ELM327 | J2534 | K-Line | manual")
    adapter_id: str | None = Field(None, description="Serijska številka adapterja")
    protocol: str | None = Field(None, description="OBD protokol: ISO 15765-4 CAN | SAE J1850 PWM | ...")
    live_data: OBDLiveData = Field(default_factory=OBDLiveData)
    raw_pids: dict[str, str] = Field(default_factory=dict, description="Surovi hex PID odgovori")
    dtcs: list[OBDRawDTC] = Field(default_factory=list, description="Odkrite DTC kode")
    vin_from_obd: str | None = Field(None, description="VIN prebran iz vozila (Mode 09)")
    ecu_info: dict[str, str] = Field(default_factory=dict, description="ECU informacije iz Mode 09")
    scanned_at: datetime | None = Field(None, description="Čas skeniranja (privzeto: zdaj)")
    notes: str | None = Field(None)


# ─── Scan Response ────────────────────────────────────────────────────────────

class OBDScanResponse(BaseModel):
    session_id: uuid.UUID
    vehicle_id: uuid.UUID
    status: str
    dtcs_found: int
    dtcs_imported: int
    dtcs_skipped: int
    live_data_updated: bool
    twin_updated: bool
    alarms_triggered: int
    scanned_at: datetime


# ─── Session Response ─────────────────────────────────────────────────────────

class OBDSessionResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    adapter_type: str
    adapter_id: str | None
    protocol: str | None
    status: str
    live_data: dict[str, Any]
    raw_pids: dict[str, str]
    dtcs_raw: list[dict[str, Any]]
    dtc_count: int
    dtcs_imported: int
    dtcs_skipped: int
    vin_from_obd: str | None
    ecu_info: dict[str, Any]
    notes: str | None
    scanned_at: datetime
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Live Data Response (iz VehicleTwin) ──────────────────────────────────────

class OBDLiveDataResponse(BaseModel):
    vehicle_id: uuid.UUID
    live_data: dict[str, Any]
    last_session_id: str | None
    last_scanned_at: str | None
    has_data: bool
