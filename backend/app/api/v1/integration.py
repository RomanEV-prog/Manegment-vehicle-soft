"""
Integracija z ERP: branje zadnje znane konfiguracije po VIN (R156 §7.1.1.6, §7.1.2.4).

Dostop z glavo `X-API-Key` (nastavitev ERP_API_KEY na strežniku; prazna = izklopljeno)
ali z običajnim JWT prijavljenega uporabnika. Samo branje.

    GET /api/v1/integration/vehicles/{vin}/last-known-configuration
"""

import hmac
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession
from app.config import settings
from app.models.organization import Organization
from app.models.r156 import VehicleType
from app.models.vehicle import Vehicle
from app.services.vehicle_config import current_configuration

router = APIRouter()


async def integration_org(request: Request, db: DbSession):
    """org_id iz API ključa (ERP) ali iz JWT (prijavljen uporabnik)."""
    key = request.headers.get("X-API-Key")
    if key:
        if not settings.erp_api_key or not hmac.compare_digest(
            key.encode("utf-8", "replace"), settings.erp_api_key.encode("utf-8")
        ):
            raise HTTPException(status_code=401, detail="Neveljaven API ključ")
        request.state.erp_read = True
        org_id = await db.scalar(select(Organization.id).where(Organization.name == settings.erp_org_name))
        if not org_id:
            raise HTTPException(status_code=500, detail="Organizacija za integracijo ni nastavljena")
        return org_id
    if getattr(request.state, "org_id", None):
        import uuid
        return uuid.UUID(request.state.org_id)
    raise HTTPException(status_code=401, detail="Manjka API ključ ali prijava")


class LastKnownConfiguration(BaseModel):
    vin: str
    vehicle_name: str
    vehicle_type: Optional[str]
    config_id: Optional[str]
    config_type: str
    reason: Optional[str]
    recorded_at: datetime
    software_update: Optional[str]
    system_schemes_baseline: Optional[str]
    erp_work_order: Optional[str]
    rxswins: list[dict]
    ecus: list[dict]


@router.get("/vehicles/{vin}/last-known-configuration", response_model=LastKnownConfiguration)
async def last_known_configuration(vin: str, request: Request, db: DbSession, org_id=Depends(integration_org)):
    v = await db.scalar(select(Vehicle).where(Vehicle.vin == vin.strip().upper(), Vehicle.organization_id == org_id))
    if not v:
        raise HTTPException(status_code=404, detail="Vozilo s tem VIN ne obstaja")
    cfg = await current_configuration(db, v.id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Za vozilo še ni zapisane konfiguracije")
    vt = await db.get(VehicleType, v.vehicle_type_id) if v.vehicle_type_id else None
    if getattr(request.state, "erp_read", False):
        from app.utils.audit import write_audit_log

        await write_audit_log(
            db=db, org_id=org_id, actor_id=None, actor_type="api_key", actor_device="erp",
            action="export", entity_type="vehicle_configuration", entity_id=cfg.id,
            after={"vin": v.vin, "config_id": cfg.config_id, "via": "ERP integration"},
        )
        await db.commit()
    from app.api.v1.vehicle_config import su_label

    return LastKnownConfiguration(
        vin=v.vin, vehicle_name=v.name, vehicle_type=vt.name if vt else None,
        config_id=cfg.config_id, config_type=cfg.config_type, reason=cfg.reason, recorded_at=cfg.created_at,
        software_update=await su_label(db, cfg.software_update_id),
        system_schemes_baseline=cfg.system_schemes_baseline, erp_work_order=cfg.erp_work_order,
        rxswins=cfg.snapshot.get("rxswins", []), ecus=cfg.snapshot.get("ecus", []),
    )
