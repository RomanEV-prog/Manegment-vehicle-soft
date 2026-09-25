"""Sheme za R156 SUMS register — tipi vozil, ECU-ji, RXSWIN-i in baseline-i."""

import re
import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.sw_update import RXSWIN_PATTERN

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def http_url(v: Optional[str]) -> Optional[str]:
    """Povezave (Egnyte, ERP) smejo biti le http(s) — javascript: ipd. bi bil XSS ob kliku."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not re.match(r"^https?://[^\s]+$", v, re.IGNORECASE):
        raise ValueError("Povezava mora začeti s http:// ali https://")
    return v


def normalize_sha256(v: Optional[str]) -> Optional[str]:
    """SHA-256 shranjujemo z malimi črkami; prazen niz pomeni 'ni vrednosti'."""
    if v is None:
        return None
    v = v.strip().lower()
    if not v:
        return None
    if not SHA256_PATTERN.match(v):
        raise ValueError("SHA-256 mora imeti 64 šestnajstiških znakov")
    return v


# ─── Tip vozila ───────────────────────────────────────────────────────────────

class VehicleTypeCreate(BaseModel):
    model_config = {"protected_namespaces": ()}

    name: str = Field(min_length=1)
    model_code: Optional[str] = None
    description: Optional[str] = None


class VehicleTypeUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}

    name: Optional[str] = Field(default=None, min_length=1)
    model_code: Optional[str] = None
    description: Optional[str] = None


class VehicleTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    model_code: Optional[str]
    description: Optional[str]
    created_at: datetime

    # model_code je ime polja iz Helixa, ne pydantic interni "model_" prostor
    model_config = {"from_attributes": True, "protected_namespaces": ()}


# ─── ECU register ─────────────────────────────────────────────────────────────

class ECUCreate(BaseModel):
    vehicle_type_id: uuid.UUID
    ecu_name: str = Field(min_length=1)
    system_name: Optional[str] = None
    supplier: Optional[str] = None
    eversum_part_number: str = Field(min_length=1)
    un_ece_reg_number: Optional[str] = None
    description: Optional[str] = None


class ECUUpdate(BaseModel):
    ecu_name: Optional[str] = Field(default=None, min_length=1)
    system_name: Optional[str] = None
    supplier: Optional[str] = None
    eversum_part_number: Optional[str] = Field(default=None, min_length=1)
    un_ece_reg_number: Optional[str] = None
    description: Optional[str] = None


class ECUResponse(BaseModel):
    id: uuid.UUID
    vehicle_type_id: uuid.UUID
    ecu_name: str
    system_name: Optional[str]
    supplier: Optional[str]
    eversum_part_number: str
    un_ece_reg_number: Optional[str]
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── RXSWIN ───────────────────────────────────────────────────────────────────

class RXSWINCreate(BaseModel):
    vehicle_type_id: uuid.UUID
    rxswin: str
    description: Optional[str] = None
    regulations_affected: list[str] = []

    @field_validator("rxswin")
    @classmethod
    def validate_rxswin(cls, v: str) -> str:
        v = v.strip()
        if not RXSWIN_PATTERN.match(v):
            raise ValueError("RXSWIN sme vsebovati le velike črke, številke in - _ . (3–64 znakov)")
        return v


class RXSWINUpdate(BaseModel):
    description: Optional[str] = None
    regulations_affected: Optional[list[str]] = None
    status: Optional[Literal["active", "retired"]] = None


class BaselineSummary(BaseModel):
    id: uuid.UUID
    baseline_number: int
    status: str
    released_at: Optional[datetime]
    item_count: int


class RXSWINListItem(BaseModel):
    id: uuid.UUID
    vehicle_type_id: uuid.UUID
    vehicle_type_name: str
    rxswin: str
    description: Optional[str]
    regulations_affected: list[str]
    status: str
    current_baseline: Optional[BaselineSummary]
    draft_baseline: Optional[BaselineSummary]
    baseline_count: int
    updated_at: datetime


# ─── Baseline in postavke ─────────────────────────────────────────────────────

class BaselineItemBase(BaseModel):
    sw_version: Optional[str] = None
    sw_file_name: Optional[str] = None
    sw_file_sha256: Optional[str] = None
    sw_config_version: Optional[str] = None
    sw_config_file_name: Optional[str] = None
    sw_config_sha256: Optional[str] = None
    egnyte_folder_url: Optional[str] = None
    compatible_hardware: Optional[str] = None
    change_log: Optional[str] = None
    description: Optional[str] = None

    @field_validator("sw_file_sha256", "sw_config_sha256")
    @classmethod
    def validate_sha(cls, v: Optional[str]) -> Optional[str]:
        return normalize_sha256(v)

    @field_validator("egnyte_folder_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        return http_url(v)


class BaselineItemCreate(BaselineItemBase):
    ecu_id: uuid.UUID
    sw_version: str = Field(min_length=1)


class BaselineItemUpdate(BaselineItemBase):
    pass


class BaselineItemResponse(BaseModel):
    id: uuid.UUID
    baseline_id: uuid.UUID
    ecu_id: uuid.UUID
    ecu_name: str
    eversum_part_number: str
    supplier: Optional[str]
    sw_version: str
    sw_file_name: Optional[str]
    sw_file_sha256: Optional[str]
    sw_config_version: Optional[str]
    sw_config_file_name: Optional[str]
    sw_config_sha256: Optional[str]
    egnyte_folder_url: Optional[str]
    compatible_hardware: Optional[str]
    change_log: Optional[str]
    description: Optional[str]
    sha_valid: bool          # ali so vse kontrolne vsote veljavne SHA-256 (pogoj za izdajo)


class BaselineCreate(BaseModel):
    notes: Optional[str] = None


class BaselineUpdate(BaseModel):
    notes: Optional[str] = None


class BaselineResponse(BaseModel):
    id: uuid.UUID
    rxswin_id: uuid.UUID
    baseline_number: int
    status: str
    integrity_method: str
    notes: Optional[str]
    released_at: Optional[datetime]
    released_by: Optional[uuid.UUID]
    released_by_name: Optional[str]
    created_by: Optional[uuid.UUID]
    created_by_name: Optional[str]
    created_at: datetime
    items: list[BaselineItemResponse]


class RXSWINDetail(BaseModel):
    id: uuid.UUID
    vehicle_type_id: uuid.UUID
    vehicle_type_name: str
    rxswin: str
    description: Optional[str]
    regulations_affected: list[str]
    status: str
    created_at: datetime
    updated_at: datetime
    baselines: list[BaselineResponse]   # najnovejši najprej


# ─── Preverjanje SHA-256 ──────────────────────────────────────────────────────

class VerifyRequest(BaseModel):
    target: Literal["sw", "config"] = "sw"
    computed_sha256: str
    file_name: Optional[str] = None
    file_size: Optional[int] = None

    @field_validator("computed_sha256")
    @classmethod
    def validate_sha(cls, v: str) -> str:
        normalized = normalize_sha256(v)
        if normalized is None:
            raise ValueError("Manjka izračunana SHA-256")
        return normalized


class VerifyResponse(BaseModel):
    match: bool
    expected_sha256: Optional[str]
    computed_sha256: str
    recorded: bool
