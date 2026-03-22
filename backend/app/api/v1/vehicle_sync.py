"""
FAZA 2 — UDS Gateway Sync

Stub endpoint za integracijo z vozilnim gateway-em.

Arhitektura (načrtovano):
  Vozilo → Gateway (UDS ISO 14229) → eVersum API → Digital Twin update

Protokol:
  - 0x22 ReadDataByIdentifier  → ECU verzije, SW identifikatorji (RXSWIN)
  - 0x19 ReadDTCInformation    → aktivni DTC-ji, status posameznih napak
  - 0x27 SecurityAccess        → zaklep inženirske diagnostike (R155)
  - 0x31 RoutineControl        → sprožitev SW update rutine (R156)

Primarna težava:
  Nekateri sistemi (npr. Hande akso) ne podpirajo UDS nativno.
  Potreben razvoj pri dobavitelju (NRC — enkratni strošek).
  Do takrat: ročni vnos prek obstoječih endpointov.

TODO faza 2:
  [ ] Gateway adapter servis (Python ali Go microservice)
  [ ] UDS session parser → VehicleTwin JSONB update
  [ ] DTC auto-import iz 0x19 sessiona
  [ ] SW verzija auto-sync iz 0x22 response
  [ ] Webhook / polling interval konfiguracija per-vozilo
  [ ] R155 audit log za vsak gateway dostop (kdo, kdaj, katera diagnostika)
"""

from fastapi import APIRouter, HTTPException
from app.api.deps import CurrentUserDep
import uuid

router = APIRouter()


@router.post("/{vehicle_id}/sync")
async def uds_gateway_sync(vehicle_id: uuid.UUID, user: CurrentUserDep):
    """
    STUB — UDS gateway sync. Implementacija v fazi 2.

    Bo sprejel UDS diagnostic session dump iz gateway-a in avtomatično
    posodobil: VehicleTwin (ECU config, active DTCs), SW update records.
    """
    raise HTTPException(
        status_code=501,
        detail="UDS gateway sync ni implementiran — faza 2. Uporabite ročni vnos.",
    )
