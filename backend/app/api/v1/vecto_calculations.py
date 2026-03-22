import uuid

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from datetime import date
from decimal import Decimal
from typing import Any

from app.api.deps import CurrentUserDep, DbSession, NonPartnerDep
from app.models.vecto_calculation import VectoCalculation
from app.models.vehicle import Vehicle
from app.utils.audit import write_audit_log

router = APIRouter()

VECTO_STATUS = ("draft", "submitted", "approved")
WLTP_CYCLES = ("Razred 1", "Razred 2", "Razred 3b")


class VectoInputParams(BaseModel):
    """Strukturirani vhodni parametri VECTO simulacije (EU 2017/337 / EU 2017/2400)."""
    # Masa
    masa_prazno_kg: float | None = Field(None, ge=0, description="Masa praznega vozila (kg)")
    masa_test_kg: float | None = Field(None, ge=0, description="Testna masa (kg)")
    masa_max_kg: float | None = Field(None, ge=0, description="Max dovoljena masa — GVM (kg)")

    # Aerodinamika
    cd: float | None = Field(None, ge=0, le=2, description="Koeficient aerodinamičnega upora (Cd)")
    a_front_m2: float | None = Field(None, ge=0, description="Čelna površina (m²)")
    cda: float | None = Field(None, ge=0, description="Cd × A (m²)")

    # Kotalniški upor (ISO 28580)
    crr_spredaj: float | None = Field(None, ge=0, description="Kotalniški upor — sprednja os (N/kN)")
    crr_zadaj: float | None = Field(None, ge=0, description="Kotalniški upor — zadnja os (N/kN)")

    # Baterija (trakcijska)
    kapaciteta_kwh: float | None = Field(None, ge=0, description="Uporabna kapaciteta baterije (kWh)")
    napetost_v: float | None = Field(None, ge=0, description="Nominalna napetost baterije (V)")
    max_moc_polnjenja_kw: float | None = Field(None, ge=0, description="Max moč polnjenja (kW)")

    # Elektromotor / pogon
    max_moc_kw: float | None = Field(None, ge=0, description="Max moč pogonskega motorja (kW)")
    max_navor_nm: float | None = Field(None, ge=0, description="Max navor (Nm)")

    # WLTP simulacija
    wltp_cikel: str | None = Field(None, description="WLTP cikel: Razred 1 / Razred 2 / Razred 3b")
    temperatura_ref_c: float | None = Field(None, ge=-40, le=60, description="Referenčna temperatura (°C)")
    tovor_kg: float | None = Field(None, ge=0, description="Tovor pri testu (kg)")

    model_config = {"extra": "allow"}   # ostali ad-hoc parametri so še vedno dovoljeni


class VectoCreate(BaseModel):
    vehicle_id: uuid.UUID
    calculated_at: date
    co2_wltp: float | None = None           # g/km
    energy_wltp: float | None = None        # Wh/km
    range_km: int | None = None
    input_params: VectoInputParams | None = None
    status: str = "draft"                   # 'draft' | 'submitted' | 'approved'


class VectoUpdate(BaseModel):
    co2_wltp: float | None = None
    energy_wltp: float | None = None
    range_km: int | None = None
    input_params: VectoInputParams | None = None
    status: str | None = None


class VectoResponse(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    organization_id: uuid.UUID
    calculated_at: date
    calculated_by: uuid.UUID | None
    co2_wltp: float | None
    energy_wltp: float | None
    range_km: int | None
    input_params: dict[str, Any] | None
    pdf_url: str | None
    status: str

    model_config = {"from_attributes": True}


def _to_response(c: VectoCalculation) -> VectoResponse:
    return VectoResponse(
        id=c.id,
        vehicle_id=c.vehicle_id,
        organization_id=c.organization_id,
        calculated_at=c.calculated_at,
        calculated_by=c.calculated_by,
        co2_wltp=float(c.co2_wltp) if c.co2_wltp is not None else None,
        energy_wltp=float(c.energy_wltp) if c.energy_wltp is not None else None,
        range_km=c.range_km,
        input_params=c.input_params,
        pdf_url=c.pdf_url,
        status=c.status,
    )


@router.get("", response_model=list[VectoResponse])
async def list_vecto_calculations(
    user: CurrentUserDep,
    db: DbSession,
    vehicle_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
):
    q = select(VectoCalculation).where(VectoCalculation.organization_id == user["org_id"])
    if vehicle_id:
        q = q.where(VectoCalculation.vehicle_id == vehicle_id)
    if status:
        q = q.where(VectoCalculation.status == status)
    result = await db.execute(q.order_by(VectoCalculation.calculated_at.desc()))
    return [_to_response(c) for c in result.scalars().all()]


@router.post("", response_model=VectoResponse, status_code=status.HTTP_201_CREATED)
async def create_vecto_calculation(data: VectoCreate, user: NonPartnerDep, db: DbSession):
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == data.vehicle_id, Vehicle.organization_id == user["org_id"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Vozilo ne obstaja")

    if data.status not in VECTO_STATUS:
        raise HTTPException(status_code=422, detail=f"Neveljaven status. Dovoljeni: {VECTO_STATUS}")

    calc = VectoCalculation(
        vehicle_id=data.vehicle_id,
        organization_id=user["org_id"],
        calculated_at=data.calculated_at,
        calculated_by=user["user_id"],
        co2_wltp=Decimal(str(data.co2_wltp)) if data.co2_wltp is not None else None,
        energy_wltp=Decimal(str(data.energy_wltp)) if data.energy_wltp is not None else None,
        range_km=data.range_km,
        input_params=data.input_params.model_dump(exclude_none=True) if data.input_params else None,
        status=data.status,
    )
    db.add(calc)
    await db.flush()

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="create",
        entity_type="vecto_calculation",
        entity_id=calc.id,
        after={
            "vehicle_id": str(calc.vehicle_id),
            "calculated_at": str(calc.calculated_at),
            "co2_wltp": float(calc.co2_wltp) if calc.co2_wltp is not None else None,
            "energy_wltp": float(calc.energy_wltp) if calc.energy_wltp is not None else None,
            "range_km": calc.range_km,
            "status": calc.status,
        },
    )

    await db.commit()
    await db.refresh(calc)
    return _to_response(calc)


@router.put("/{calc_id}", response_model=VectoResponse)
async def update_vecto_calculation(
    calc_id: uuid.UUID,
    data: VectoUpdate,
    user: NonPartnerDep,
    db: DbSession,
):
    result = await db.execute(
        select(VectoCalculation).where(
            VectoCalculation.id == calc_id,
            VectoCalculation.organization_id == user["org_id"],
        )
    )
    calc = result.scalar_one_or_none()
    if not calc:
        raise HTTPException(status_code=404, detail="Vecto izračun ne obstaja")

    if data.co2_wltp is not None:
        calc.co2_wltp = Decimal(str(data.co2_wltp))
    if data.energy_wltp is not None:
        calc.energy_wltp = Decimal(str(data.energy_wltp))
    if data.range_km is not None:
        calc.range_km = data.range_km
    if data.input_params is not None:
        calc.input_params = data.input_params.model_dump(exclude_none=True)
    if data.status is not None:
        if data.status not in VECTO_STATUS:
            raise HTTPException(status_code=422, detail=f"Neveljaven status. Dovoljeni: {VECTO_STATUS}")
        calc.status = data.status

    await write_audit_log(
        db=db,
        org_id=user["org_id"],
        actor_id=user["user_id"],
        actor_type="user",
        actor_device="web",
        action="update",
        entity_type="vecto_calculation",
        entity_id=calc.id,
        after={
            "co2_wltp": float(calc.co2_wltp) if calc.co2_wltp is not None else None,
            "energy_wltp": float(calc.energy_wltp) if calc.energy_wltp is not None else None,
            "range_km": calc.range_km,
            "status": calc.status,
        },
    )

    await db.commit()
    await db.refresh(calc)
    return _to_response(calc)


@router.get("/{calc_id}/pdf")
async def vecto_pdf(calc_id: uuid.UUID, user: CurrentUserDep, db: DbSession):
    """VECTO PDF poročilo za posamezen izračun (EU Uredba 2017/337)."""
    from app.services.report_service import generate_vecto_pdf
    try:
        pdf_bytes = await generate_vecto_pdf(db, calc_id, user["org_id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=VECTO_{calc_id}.pdf"},
    )
