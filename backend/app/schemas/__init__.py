from app.schemas.auth import TokenResponse, LoginRequest
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse
from app.schemas.sw_update import SWUpdateCreate, SWUpdateResponse
from app.schemas.dtc_record import DTCRecordCreate, DTCRecordUpdate, DTCRecordResponse
from app.schemas.homologation import (
    HomologationCreate,
    HomologationUpdate,
    HomologationResponse,
    CoCCertificateCreate,
    CoCCertificateResponse,
)
from app.schemas.service_record import ServiceRecordCreate, ServiceRecordResponse
from app.schemas.alarm import AlarmEventResponse, AlarmConfigCreate, AlarmConfigResponse
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.photo import PhotoResponse

__all__ = [
    "TokenResponse",
    "LoginRequest",
    "VehicleCreate",
    "VehicleUpdate",
    "VehicleResponse",
    "SWUpdateCreate",
    "SWUpdateResponse",
    "DTCRecordCreate",
    "DTCRecordUpdate",
    "DTCRecordResponse",
    "HomologationCreate",
    "HomologationUpdate",
    "HomologationResponse",
    "CoCCertificateCreate",
    "CoCCertificateResponse",
    "ServiceRecordCreate",
    "ServiceRecordResponse",
    "AlarmEventResponse",
    "AlarmConfigCreate",
    "AlarmConfigResponse",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "PhotoResponse",
]
