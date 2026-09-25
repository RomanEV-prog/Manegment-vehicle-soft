from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.security import SecurityHeadersMiddleware
from app.middleware.tenant import TenantMiddleware
from app.api.v1 import (
    auth,
    organizations,
    users,
    vehicles,
    service_records,
    sw_updates,
    dtc_records,
    homologations,
    coc_certificates,
    vecto_calculations,
    photos,
    twins,
    alarms,
    reports,
    websocket,
    audit_log,
    vehicle_sync,
    obd,
    r156,
    su_documents,
)

_is_dev = settings.environment != "production"

app = FastAPI(
    title="eVersum Vehicle Compliance & Tracking System",
    description="Centraliziran sistem za sledenje celotnega življenjskega cikla programske opreme vozila.",
    version="1.0.0",
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# Multi-tenant middleware (dodan drugi = teče predzadnji)
app.add_middleware(TenantMiddleware)

# CORS (dodan zadnji = teče prvi, pred vsem drugim)
_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://app.eversum.com",
] if _is_dev else ["https://app.eversum.com"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,
)

# Routers
API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX + "/auth", tags=["Auth"])
app.include_router(organizations.router, prefix=API_PREFIX + "/organizations", tags=["Organizations"])
app.include_router(users.router, prefix=API_PREFIX + "/users", tags=["Users"])
app.include_router(vehicles.router, prefix=API_PREFIX + "/vehicles", tags=["Vehicles"])
app.include_router(service_records.router, prefix=API_PREFIX + "/service-records", tags=["Service Records"])
app.include_router(sw_updates.router, prefix=API_PREFIX + "/sw-updates", tags=["SW Updates"])
app.include_router(dtc_records.router, prefix=API_PREFIX + "/dtc-records", tags=["DTC Records"])
app.include_router(homologations.router, prefix=API_PREFIX + "/homologations", tags=["Homologations"])
app.include_router(coc_certificates.router, prefix=API_PREFIX + "/coc-certificates", tags=["CoC Certificates"])
app.include_router(vecto_calculations.router, prefix=API_PREFIX + "/vecto-calculations", tags=["Vecto Calculations"])
app.include_router(photos.router, prefix=API_PREFIX + "/photos", tags=["Photos"])
app.include_router(twins.router, prefix=API_PREFIX + "/twins", tags=["Digital Twin"])
app.include_router(alarms.router, prefix=API_PREFIX + "/alarms", tags=["Alarms"])
app.include_router(reports.router, prefix=API_PREFIX + "/reports", tags=["Reports"])
app.include_router(websocket.router, prefix="/ws", tags=["WebSocket"])
app.include_router(audit_log.router, prefix=API_PREFIX + "/audit-logs", tags=["Audit Log"])
app.include_router(vehicle_sync.router, prefix=API_PREFIX + "/vehicle-sync", tags=["Vehicle Sync (UDS)"])
app.include_router(obd.router, prefix=API_PREFIX + "/obd", tags=["OBD-II"])
app.include_router(r156.router, prefix=API_PREFIX, tags=["R156 SUMS"])
app.include_router(su_documents.router, prefix=API_PREFIX + "/software-updates", tags=["R156 Software Update"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "eVersum API", "version": "1.0.0"}
