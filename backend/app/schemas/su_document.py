"""Sheme za Software Update dokument (R156 §7.1.2.5) s prizadetimi RXSWIN-i in ciljnimi vozili."""

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.r156 import http_url

# Polja, ki jih ureja uporabnik v osnutku — vrstni red sledi §7.1.2.5
EDITABLE_FIELDS = (
    "title",
    "description_purpose",
    "dependencies_identified",
    "system_schemes_baseline",
    "type_approval_update_necessary",
    "type_approval_justification",
    "unece_affected_requirements",
    "type_approval_granted",
    "type_approval_number",
    "type_approval_date",
    "user_notification_required",
    "execution_conditions",
    "safe_state_conditions",
    "user_actions_required",
    "new_hardware_required",
    "safety_security_confirmation",
    "erp_work_order",
    "erp_work_order_url",
    "egnyte_folder_url",
)


class SUDocumentCreate(BaseModel):
    vehicle_type_id: uuid.UUID
    title: str = Field(min_length=1)
    description_purpose: str = Field(min_length=1)


class SUDocumentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description_purpose: Optional[str] = Field(default=None, min_length=1)
    dependencies_identified: Optional[str] = None
    system_schemes_baseline: Optional[str] = None
    type_approval_update_necessary: Optional[bool] = None
    type_approval_justification: Optional[str] = None
    unece_affected_requirements: Optional[list[str]] = None
    type_approval_granted: Optional[bool] = None
    type_approval_number: Optional[str] = None
    type_approval_date: Optional[date] = None
    user_notification_required: Optional[bool] = None
    execution_conditions: Optional[str] = None
    safe_state_conditions: Optional[str] = None
    user_actions_required: Optional[str] = None
    new_hardware_required: Optional[bool] = None
    safety_security_confirmation: Optional[str] = None
    erp_work_order: Optional[str] = None
    erp_work_order_url: Optional[str] = None
    egnyte_folder_url: Optional[str] = None

    @field_validator("erp_work_order_url", "egnyte_folder_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        return http_url(v)


class VVSignRequest(BaseModel):
    vv_status: Literal["pass", "fail"]
    vv_method: str = Field(min_length=1)


class AffectedRxswinCreate(BaseModel):
    rxswin_id: uuid.UUID
    baseline_after_id: uuid.UUID


class TargetsAdd(BaseModel):
    vehicle_ids: list[uuid.UUID] = Field(min_length=1)


class TargetCompatibility(BaseModel):
    compatibility_confirmed: bool
    compatibility_notes: Optional[str] = None


class TargetResult(BaseModel):
    result: Literal["success", "failed", "rolled_back"]


class UserNotification(BaseModel):
    method: str = Field(min_length=1)    # npr. "E-mail to fleet manager"


# ─── Odgovori ─────────────────────────────────────────────────────────────────

class AffectedRxswinResponse(BaseModel):
    id: uuid.UUID
    rxswin_id: uuid.UUID
    rxswin: str
    baseline_before_id: Optional[uuid.UUID]
    baseline_before_number: Optional[int]
    baseline_after_id: Optional[uuid.UUID]
    baseline_after_number: Optional[int]
    baseline_after_status: Optional[str]


class TargetResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    vin: str
    vehicle_name: str
    compatibility_confirmed: bool
    compatibility_notes: Optional[str]
    confirmed_by_name: Optional[str]
    confirmed_at: Optional[datetime]
    result: Optional[str]
    applied_at: Optional[datetime]
    applied_by_name: Optional[str]
    # §7.1.1.7: zadnja znana konfiguracija vozila glede na baseline "pred"
    current_config_id: Optional[str] = None
    precondition: Literal["ok", "mismatch", "already_installed", "unknown"] = "unknown"
    precondition_detail: list[str] = []


class SUDocumentListItem(BaseModel):
    id: uuid.UUID
    document_id: str
    revision: int
    title: str
    vehicle_type_id: uuid.UUID
    vehicle_type_name: str
    status: str
    vv_status: str
    rxswins: list[str]
    target_count: int
    applied_count: int
    released_at: Optional[datetime]
    updated_at: datetime


class SUDocumentDetail(BaseModel):
    id: uuid.UUID
    document_id: str
    revision: int
    vehicle_type_id: uuid.UUID
    vehicle_type_name: str
    status: str

    title: str
    description_purpose: str
    dependencies_identified: Optional[str]
    system_schemes_baseline: Optional[str]

    vv_status: str
    vv_method: Optional[str]
    vv_signed_by_name: Optional[str]
    vv_signed_at: Optional[datetime]

    type_approval_update_necessary: Optional[bool]
    type_approval_justification: Optional[str]
    unece_affected_requirements: list[str]
    type_approval_granted: Optional[bool]
    type_approval_number: Optional[str]
    type_approval_date: Optional[date]

    user_notification_required: bool
    user_notification_method: Optional[str]
    user_notified_at: Optional[datetime]
    user_notified_by_name: Optional[str]

    execution_conditions: Optional[str]
    safe_state_conditions: Optional[str]
    user_actions_required: Optional[str]
    new_hardware_required: bool
    safety_security_confirmation: Optional[str]

    erp_work_order: Optional[str]
    erp_work_order_url: Optional[str]
    egnyte_folder_url: Optional[str]

    released_at: Optional[datetime]
    released_by_name: Optional[str]
    supersedes_id: Optional[uuid.UUID]
    superseded_by_id: Optional[uuid.UUID]
    created_by_name: Optional[str]
    created_at: datetime
    updated_at: datetime

    affected_rxswins: list[AffectedRxswinResponse]
    targets: list[TargetResponse]
    release_blockers: list[str]      # prazno = pripravljen za izdajo
    revisions: list[dict]            # [{id, revision, status}] — vse revizije istega document_id
