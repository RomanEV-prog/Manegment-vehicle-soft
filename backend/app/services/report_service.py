"""
Report service — PDF generacija.
SUMS poročilo za UNECE R156 revizorje.
"""
import uuid
from datetime import datetime, timezone

from jinja2 import Environment, BaseLoader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vehicle import Vehicle
from app.models.vehicle_twin import VehicleTwin
from app.models.twin_snapshot import TwinSnapshot
from app.models.sw_update import SWUpdate
from app.models.homologation import Homologation
from app.models.coc_certificate import CoCCertificate
from app.models.dtc_record import DTCRecord


SUMS_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 40px; }
  h1 { color: #1a3c5e; font-size: 18px; border-bottom: 2px solid #1a3c5e; padding-bottom: 8px; }
  h2 { color: #1a3c5e; font-size: 14px; margin-top: 24px; }
  h3 { font-size: 12px; margin-top: 16px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1a3c5e; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f5f8fc; }
  .badge-compliant { background: #d4edda; color: #155724; padding: 2px 6px; border-radius: 3px; }
  .badge-open { background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 3px; }
  .badge-expired { background: #f8d7da; color: #721c24; padding: 2px 6px; border-radius: 3px; }
  .badge-success { background: #d4edda; color: #155724; padding: 2px 6px; border-radius: 3px; }
  .badge-failed { background: #f8d7da; color: #721c24; padding: 2px 6px; border-radius: 3px; }
  .meta { font-size: 10px; color: #666; margin-bottom: 20px; }
  .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9px; color: #999; }
  .rxswin { font-family: monospace; font-size: 10px; background: #f0f0f0; padding: 1px 4px; border-radius: 2px; }
</style>
</head>
<body>

<h1>SUMS Poročilo — {{ vehicle.name }}</h1>
<div class="meta">
  <b>VIN:</b> {{ vehicle.vin }} &nbsp;|&nbsp;
  <b>Model:</b> {{ vehicle.model }} &nbsp;|&nbsp;
  <b>Leto:</b> {{ vehicle.year }} &nbsp;|&nbsp;
  <b>Projekt:</b> {{ vehicle.project_name or "—" }} &nbsp;|&nbsp;
  <b>Status:</b> {{ vehicle.status }}<br>
  <b>Generirano:</b> {{ generated_at }} &nbsp;|&nbsp;
  <b>Standard:</b> UNECE R156 §7.1, §7.1.2, §7.2, §7.4
</div>

<!-- ECU Konfiguracija (Digital Twin) -->
<h2>1. Trenutna SW konfiguracija vozila (§7.1.2)</h2>
{% if ecu_config %}
<table>
  <tr><th>ECU Modul</th><th>Verzija</th><th>RXSWIN</th><th>Zadnja posodobitev</th></tr>
  {% for module, info in ecu_config.items() %}
  <tr>
    <td>{{ module }}</td>
    <td>{{ info.get('version', '—') }}</td>
    <td><span class="rxswin">{{ info.get('rxswin', '—') }}</span></td>
    <td>{{ info.get('updated_at', '—') }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni podatkov o ECU konfiguraciji.</i></p>
{% endif %}

<!-- SW Posodobitve Historia -->
<h2>2. Historia SW posodobitev (§7.1, §7.2, §7.4)</h2>
{% if sw_updates %}
<table>
  <tr><th>Datum</th><th>ECU Modul</th><th>Pred</th><th>Po</th><th>RXSWIN</th><th>Metoda</th><th>Status</th></tr>
  {% for sw in sw_updates %}
  <tr>
    <td>{{ sw.date }}</td>
    <td>{{ sw.ecu_module }}</td>
    <td>{{ sw.version_before }}</td>
    <td>{{ sw.version_after }}</td>
    <td><span class="rxswin">{{ sw.rxswin }}</span></td>
    <td>{{ sw.method }}</td>
    <td>
      {% if sw.status == 'success' %}<span class="badge-success">✓ Uspeh</span>
      {% elif sw.status == 'failed' %}<span class="badge-failed">✗ Napaka</span>
      {% else %}{{ sw.status }}{% endif %}
    </td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni zabeleženih SW posodobitev.</i></p>
{% endif %}

<!-- Homologacijski Status -->
<h2>3. Regulativna skladnost (HON status)</h2>
{% if homologations %}
<table>
  <tr><th>Uredba</th><th>Status</th><th>Organ</th><th>Država</th><th>Veljavno do</th><th>Nasl. akcija</th></tr>
  {% for hom in homologations %}
  <tr>
    <td><b>{{ hom.regulation }}</b></td>
    <td>
      {% if hom.status == 'compliant' %}<span class="badge-compliant">✓ Skladno</span>
      {% elif hom.status == 'expired' %}<span class="badge-expired">✗ Poteklo</span>
      {% else %}<span class="badge-open">⏳ {{ hom.status }}</span>{% endif %}
    </td>
    <td>{{ hom.authority or "—" }}</td>
    <td>{{ hom.country or "—" }}</td>
    <td>{{ hom.valid_until or "—" }}</td>
    <td>{{ hom.next_action_due or "—" }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni homologacijskih zapisov.</i></p>
{% endif %}

<!-- CoC Certifikati -->
<h2>4. Certificate of Conformity (CoC)</h2>
{% if coc_certs %}
<table>
  <tr><th>Številka CoC</th><th>Izdan</th><th>Velja do</th><th>Organ</th></tr>
  {% for coc in coc_certs %}
  <tr>
    <td><b>{{ coc.coc_number }}</b></td>
    <td>{{ coc.issued_at }}</td>
    <td>{{ coc.valid_until or "—" }}</td>
    <td>{{ coc.issuing_body or "—" }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni CoC certifikatov.</i></p>
{% endif %}

<!-- Aktivne DTC napake -->
<h2>5. Aktivne diagnostične napake (DTC)</h2>
{% if active_dtcs %}
<table>
  <tr><th>Koda</th><th>Opis</th><th>Resnost</th><th>Zaznano</th></tr>
  {% for dtc in active_dtcs %}
  <tr>
    <td><b>{{ dtc.code }}</b></td>
    <td>{{ dtc.description }}</td>
    <td>{% if dtc.severity == 'high' %}<span class="badge-failed">Visoka</span>
        {% elif dtc.severity == 'medium' %}<span class="badge-open">Srednja</span>
        {% else %}Nizka{% endif %}</td>
    <td>{{ dtc.detected_at.strftime('%d.%m.%Y') }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><span class="badge-compliant">✓ Ni aktivnih DTC napak</span></p>
{% endif %}

<!-- Snapshots -->
<h2>6. Audit trail — Spremembe konfiguracije (§7.4)</h2>
{% if snapshots %}
<table>
  <tr><th>Datum</th><th>Tip spremembe</th><th>Opis</th></tr>
  {% for snap in snapshots %}
  <tr>
    <td>{{ snap.created_at.strftime('%d.%m.%Y %H:%M') }}</td>
    <td>{{ snap.trigger_type }}</td>
    <td>{{ snap.trigger_label or "—" }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni zabeleženih sprememb.</i></p>
{% endif %}

<div class="footer">
  eVersum Vehicle Compliance &amp; Tracking System | SUMS Poročilo | {{ generated_at }}<br>
  Dokument generiran skladno z UNECE R156 §7.1, §7.1.2, §7.2, §7.4
</div>
</body>
</html>
"""


async def generate_sums_pdf(db: AsyncSession, vehicle_id: uuid.UUID, org_id: uuid.UUID) -> bytes:
    """Generira SUMS PDF poročilo za vozilo (R156 §7.1.2)."""

    # Vozilo
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise ValueError("Vozilo ne obstaja")

    # Digital twin
    result = await db.execute(select(VehicleTwin).where(VehicleTwin.vehicle_id == vehicle_id))
    twin = result.scalar_one_or_none()
    ecu_config = twin.ecu_config if twin else {}

    # SW posodobitve
    result = await db.execute(
        select(SWUpdate)
        .where(SWUpdate.vehicle_id == vehicle_id)
        .order_by(SWUpdate.date.desc())
    )
    sw_updates = result.scalars().all()

    # Homologacije
    result = await db.execute(
        select(Homologation).where(Homologation.vehicle_id == vehicle_id)
    )
    homologations = result.scalars().all()

    # CoC certifikati
    result = await db.execute(
        select(CoCCertificate)
        .where(CoCCertificate.vehicle_id == vehicle_id)
        .order_by(CoCCertificate.issued_at.desc())
    )
    coc_certs = result.scalars().all()

    # Aktivne DTC napake
    result = await db.execute(
        select(DTCRecord)
        .where(DTCRecord.vehicle_id == vehicle_id, DTCRecord.status == "active")
        .order_by(DTCRecord.detected_at.desc())
    )
    active_dtcs = result.scalars().all()

    # Zadnjih 50 snapshotov
    result = await db.execute(
        select(TwinSnapshot)
        .where(TwinSnapshot.vehicle_id == vehicle_id)
        .order_by(TwinSnapshot.created_at.desc())
        .limit(50)
    )
    snapshots = result.scalars().all()

    # Render HTML
    env = Environment(loader=BaseLoader())
    template = env.from_string(SUMS_HTML_TEMPLATE)
    html = template.render(
        vehicle=vehicle,
        ecu_config=ecu_config,
        sw_updates=sw_updates,
        homologations=homologations,
        coc_certs=coc_certs,
        active_dtcs=active_dtcs,
        snapshots=snapshots,
        generated_at=datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC"),
    )

    # HTML → PDF z WeasyPrint
    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html).write_pdf()
        return pdf_bytes
    except ImportError:
        # WeasyPrint ni nameščen — vrni HTML kot fallback
        return html.encode("utf-8")


VECTO_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 40px; }
  h1 { color: #1a4d2e; font-size: 18px; border-bottom: 2px solid #1a4d2e; padding-bottom: 8px; }
  h2 { color: #1a4d2e; font-size: 14px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1a4d2e; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f0f7f2; }
  .badge-approved { background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 3px; font-weight: bold; }
  .badge-draft { background: #e2e3e5; color: #383d41; padding: 2px 8px; border-radius: 3px; }
  .badge-submitted { background: #cce5ff; color: #004085; padding: 2px 8px; border-radius: 3px; }
  .meta { font-size: 10px; color: #666; margin-bottom: 20px; line-height: 1.8; }
  .kpi-grid { display: flex; gap: 20px; margin: 16px 0; }
  .kpi { background: #f0f7f2; border: 1px solid #b7dfb8; border-radius: 6px; padding: 12px 20px; text-align: center; flex: 1; }
  .kpi-value { font-size: 22px; font-weight: bold; color: #1a4d2e; }
  .kpi-label { font-size: 9px; color: #666; margin-top: 4px; }
  .params-table td:first-child { font-weight: bold; color: #444; width: 200px; }
  .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9px; color: #999; }
  .regulation-box { background: #fffde7; border-left: 4px solid #f9a825; padding: 8px 12px; margin: 12px 0; font-size: 10px; }
</style>
</head>
<body>

<h1>VECTO Poročilo — {{ vehicle.name }}</h1>
<div class="meta">
  <b>VIN:</b> {{ vehicle.vin }} &nbsp;|&nbsp;
  <b>Model:</b> {{ vehicle.model }} &nbsp;|&nbsp;
  <b>Projekt:</b> {{ vehicle.project_name or "—" }}<br>
  <b>Datum izračuna:</b> {{ calc.calculated_at }} &nbsp;|&nbsp;
  <b>Status:</b>
  {% if calc.status == 'approved' %}<span class="badge-approved">✓ Potrjeno</span>
  {% elif calc.status == 'submitted' %}<span class="badge-submitted">Predloženo</span>
  {% else %}<span class="badge-draft">Osnutek</span>{% endif %}
  <br>
  <b>Generirano:</b> {{ generated_at }} &nbsp;|&nbsp;
  <b>Standard:</b> EU Uredba 2017/337 (VECTO)
</div>

<div class="regulation-box">
  <b>EU Uredba 2017/337 — VECTO (Vehicle Energy Consumption calculation TOol)</b><br>
  Izračun specifičnih emisij CO₂ in porabe energije za težka vozila v skladu z
  Uredbo EU 2017/2400 in Izvedbeno uredbo EU 2022/1362.
</div>

<!-- KPI vrednosti -->
<h2>1. Rezultati izračuna</h2>
<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-value">{{ "%.1f"|format(calc.co2_wltp) if calc.co2_wltp is not none else "—" }}</div>
    <div class="kpi-label">CO₂ WLTP (g/km)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">{{ "%.1f"|format(calc.energy_wltp) if calc.energy_wltp is not none else "—" }}</div>
    <div class="kpi-label">Energija WLTP (Wh/km)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">{{ calc.range_km if calc.range_km is not none else "—" }}</div>
    <div class="kpi-label">Doseg (km)</div>
  </div>
</div>

<!-- Vhodni parametri -->
<h2>2. Vhodni parametri simulacije (EU 2017/2400)</h2>
{% if calc.input_params %}
{% set p = calc.input_params %}

{% if p.masa_prazno_kg is defined or p.masa_test_kg is defined or p.masa_max_kg is defined %}
<h3 style="font-size:11px;color:#1a4d2e;margin:14px 0 4px;">2.1 Masa vozila</h3>
<table class="params-table">
  <tr><th>Parameter</th><th>Vrednost</th><th>Enota</th></tr>
  {% if p.masa_prazno_kg is defined %}<tr><td>Masa praznega vozila</td><td>{{ p.masa_prazno_kg }}</td><td>kg</td></tr>{% endif %}
  {% if p.masa_test_kg is defined %}<tr><td>Testna masa (WLTP)</td><td>{{ p.masa_test_kg }}</td><td>kg</td></tr>{% endif %}
  {% if p.masa_max_kg is defined %}<tr><td>Max dovoljena masa (GVM)</td><td>{{ p.masa_max_kg }}</td><td>kg</td></tr>{% endif %}
</table>
{% endif %}

{% if p.cd is defined or p.a_front_m2 is defined or p.cda is defined %}
<h3 style="font-size:11px;color:#1a4d2e;margin:14px 0 4px;">2.2 Aerodinamika</h3>
<table class="params-table">
  <tr><th>Parameter</th><th>Vrednost</th><th>Enota</th></tr>
  {% if p.cd is defined %}<tr><td>Koeficient upora (Cₐ)</td><td>{{ p.cd }}</td><td>—</td></tr>{% endif %}
  {% if p.a_front_m2 is defined %}<tr><td>Čelna površina</td><td>{{ p.a_front_m2 }}</td><td>m²</td></tr>{% endif %}
  {% if p.cda is defined %}<tr><td>Cₐ × A</td><td>{{ p.cda }}</td><td>m²</td></tr>{% endif %}
</table>
{% endif %}

{% if p.crr_spredaj is defined or p.crr_zadaj is defined %}
<h3 style="font-size:11px;color:#1a4d2e;margin:14px 0 4px;">2.3 Kotalniški upor (ISO 28580)</h3>
<table class="params-table">
  <tr><th>Parameter</th><th>Vrednost</th><th>Enota</th></tr>
  {% if p.crr_spredaj is defined %}<tr><td>Crr — sprednja os</td><td>{{ p.crr_spredaj }}</td><td>N/kN</td></tr>{% endif %}
  {% if p.crr_zadaj is defined %}<tr><td>Crr — zadnja os</td><td>{{ p.crr_zadaj }}</td><td>N/kN</td></tr>{% endif %}
</table>
{% endif %}

{% if p.kapaciteta_kwh is defined or p.napetost_v is defined or p.max_moc_polnjenja_kw is defined %}
<h3 style="font-size:11px;color:#1a4d2e;margin:14px 0 4px;">2.4 Trakcijska baterija</h3>
<table class="params-table">
  <tr><th>Parameter</th><th>Vrednost</th><th>Enota</th></tr>
  {% if p.kapaciteta_kwh is defined %}<tr><td>Uporabna kapaciteta</td><td>{{ p.kapaciteta_kwh }}</td><td>kWh</td></tr>{% endif %}
  {% if p.napetost_v is defined %}<tr><td>Nominalna napetost</td><td>{{ p.napetost_v }}</td><td>V</td></tr>{% endif %}
  {% if p.max_moc_polnjenja_kw is defined %}<tr><td>Max moč polnjenja</td><td>{{ p.max_moc_polnjenja_kw }}</td><td>kW</td></tr>{% endif %}
</table>
{% endif %}

{% if p.max_moc_kw is defined or p.max_navor_nm is defined %}
<h3 style="font-size:11px;color:#1a4d2e;margin:14px 0 4px;">2.5 Elektromotor / pogon</h3>
<table class="params-table">
  <tr><th>Parameter</th><th>Vrednost</th><th>Enota</th></tr>
  {% if p.max_moc_kw is defined %}<tr><td>Max moč motorja</td><td>{{ p.max_moc_kw }}</td><td>kW</td></tr>{% endif %}
  {% if p.max_navor_nm is defined %}<tr><td>Max navor</td><td>{{ p.max_navor_nm }}</td><td>Nm</td></tr>{% endif %}
</table>
{% endif %}

{% if p.wltp_cikel is defined or p.temperatura_ref_c is defined or p.tovor_kg is defined %}
<h3 style="font-size:11px;color:#1a4d2e;margin:14px 0 4px;">2.6 Pogoji simulacije</h3>
<table class="params-table">
  <tr><th>Parameter</th><th>Vrednost</th><th>Enota</th></tr>
  {% if p.wltp_cikel is defined %}<tr><td>WLTP cikel</td><td>{{ p.wltp_cikel }}</td><td>—</td></tr>{% endif %}
  {% if p.temperatura_ref_c is defined %}<tr><td>Referenčna temperatura</td><td>{{ p.temperatura_ref_c }}</td><td>°C</td></tr>{% endif %}
  {% if p.tovor_kg is defined %}<tr><td>Tovor pri testu</td><td>{{ p.tovor_kg }}</td><td>kg</td></tr>{% endif %}
</table>
{% endif %}

{% else %}
<p><i>Vhodni parametri niso zabeleženi.</i></p>
{% endif %}

<!-- Vozilo -->
<h2>3. Identifikacija vozila</h2>
<table class="params-table">
  <tr><th>Podatek</th><th>Vrednost</th></tr>
  <tr><td>Ime vozila</td><td>{{ vehicle.name }}</td></tr>
  <tr><td>Model</td><td>{{ vehicle.model }}</td></tr>
  <tr><td>Leto izdelave</td><td>{{ vehicle.year }}</td></tr>
  <tr><td>VIN</td><td>{{ vehicle.vin }}</td></tr>
  <tr><td>Projekt</td><td>{{ vehicle.project_name or "—" }}</td></tr>
  <tr><td>Status vozila</td><td>{{ vehicle.status }}</td></tr>
</table>

<div class="footer">
  eVersum Vehicle Compliance &amp; Tracking System | VECTO Poročilo | {{ generated_at }}<br>
  Skladno z EU Uredbo 2017/337, 2017/2400 in Izvedbeno uredbo 2022/1362
</div>
</body>
</html>
"""


async def generate_vecto_pdf(
    db: AsyncSession,
    calc_id: uuid.UUID,
    org_id: uuid.UUID,
) -> bytes:
    """Generira VECTO PDF poročilo za posamezen izračun (EU Uredba 2017/337)."""
    from app.models.vecto_calculation import VectoCalculation

    result = await db.execute(
        select(VectoCalculation).where(
            VectoCalculation.id == calc_id,
            VectoCalculation.organization_id == org_id,
        )
    )
    calc = result.scalar_one_or_none()
    if not calc:
        raise ValueError("VECTO izračun ne obstaja")

    result = await db.execute(
        select(Vehicle).where(Vehicle.id == calc.vehicle_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise ValueError("Vozilo ne obstaja")

    # Decimal → float za Jinja2
    class CalcProxy:
        def __init__(self, c):
            self.calculated_at = c.calculated_at
            self.status = c.status
            self.co2_wltp = float(c.co2_wltp) if c.co2_wltp is not None else None
            self.energy_wltp = float(c.energy_wltp) if c.energy_wltp is not None else None
            self.range_km = c.range_km
            self.input_params = c.input_params

    env = Environment(loader=BaseLoader())
    template = env.from_string(VECTO_HTML_TEMPLATE)
    html = template.render(
        vehicle=vehicle,
        calc=CalcProxy(calc),
        generated_at=datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC"),
    )

    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except ImportError:
        return html.encode("utf-8")


HOM_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 40px; }
  h1 { color: #3d1a5e; font-size: 18px; border-bottom: 2px solid #3d1a5e; padding-bottom: 8px; }
  h2 { color: #3d1a5e; font-size: 14px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #3d1a5e; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f8f5fc; }
  .badge-approved { background: #d4edda; color: #155724; padding: 2px 8px; border-radius: 3px; font-weight: bold; }
  .badge-pending { background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 3px; }
  .badge-progress { background: #cce5ff; color: #004085; padding: 2px 8px; border-radius: 3px; }
  .badge-expired { background: #f8d7da; color: #721c24; padding: 2px 8px; border-radius: 3px; }
  .badge-rejected { background: #f8d7da; color: #721c24; padding: 2px 8px; border-radius: 3px; }
  .meta { font-size: 10px; color: #666; margin-bottom: 20px; line-height: 1.8; }
  .summary-grid { display: flex; gap: 16px; margin: 16px 0; }
  .summary-box { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px 16px; text-align: center; }
  .summary-value { font-size: 20px; font-weight: bold; }
  .summary-label { font-size: 9px; color: #666; margin-top: 4px; }
  .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9px; color: #999; }
  .r155-box { background: #e8f4f8; border-left: 4px solid #2196f3; padding: 8px 12px; margin: 12px 0; font-size: 10px; }
</style>
</head>
<body>

<h1>Homologacijsko Poročilo — {{ vehicle.name }}</h1>
<div class="meta">
  <b>VIN:</b> {{ vehicle.vin }} &nbsp;|&nbsp;
  <b>Model:</b> {{ vehicle.model }} &nbsp;|&nbsp;
  <b>Leto:</b> {{ vehicle.year }} &nbsp;|&nbsp;
  <b>Projekt:</b> {{ vehicle.project_name or "—" }} &nbsp;|&nbsp;
  <b>Status vozila:</b> {{ vehicle.status }}<br>
  <b>Generirano:</b> {{ generated_at }} &nbsp;|&nbsp;
  <b>Standard:</b> UNECE R155, R156 — Cybersecurity & SW Update Management
</div>

<div class="r155-box">
  <b>UNECE R155/R156 Skladnostni pregled</b> — Dokument za GR organe (ECE), TÜV, JRC in pristojne nacionalne organe.
  Vsebuje celoten regulativni status vozila, veljavnost homologacij in CoC certifikatov.
</div>

<!-- Povzetek -->
{% set approved = homologations | selectattr('status', 'eq', 'approved') | list %}
{% set pending = homologations | selectattr('status', 'in', ['pending', 'in_progress']) | list %}
{% set expired = homologations | selectattr('status', 'in', ['expired', 'rejected']) | list %}

<div class="summary-grid">
  <div class="summary-box" style="border-color:#28a745">
    <div class="summary-value" style="color:#28a745">{{ approved | length }}</div>
    <div class="summary-label">ODOBRENIH</div>
  </div>
  <div class="summary-box" style="border-color:#ffc107">
    <div class="summary-value" style="color:#856404">{{ pending | length }}</div>
    <div class="summary-label">V POSTOPKU</div>
  </div>
  <div class="summary-box" style="border-color:#dc3545">
    <div class="summary-value" style="color:#dc3545">{{ expired | length }}</div>
    <div class="summary-label">POTEKLO / ZAVRNJENO</div>
  </div>
  <div class="summary-box" style="border-color:#6c757d">
    <div class="summary-value" style="color:#6c757d">{{ coc_certs | length }}</div>
    <div class="summary-label">CoC CERTIFIKATOV</div>
  </div>
</div>

<!-- Homologacije -->
<h2>1. Regulativna Skladnost po Uredbah</h2>
{% if homologations %}
<table>
  <tr>
    <th>Uredba</th>
    <th>Status</th>
    <th>Pristojni organ</th>
    <th>Država</th>
    <th>Veljavno od</th>
    <th>Veljavno do</th>
    <th>Naslednja akcija</th>
  </tr>
  {% for hom in homologations %}
  <tr>
    <td><b>{{ hom.regulation }}</b></td>
    <td>
      {% if hom.status == 'approved' %}<span class="badge-approved">✓ Odobreno</span>
      {% elif hom.status == 'in_progress' %}<span class="badge-progress">⟳ V postopku</span>
      {% elif hom.status == 'pending' %}<span class="badge-pending">⏳ V čakanju</span>
      {% elif hom.status == 'expired' %}<span class="badge-expired">✗ Poteklo</span>
      {% elif hom.status == 'rejected' %}<span class="badge-rejected">✗ Zavrnjeno</span>
      {% else %}{{ hom.status }}{% endif %}
    </td>
    <td>{{ hom.authority or "—" }}</td>
    <td>{{ hom.country or "—" }}</td>
    <td>{{ hom.valid_from or "—" }}</td>
    <td>{{ hom.valid_until or "—" }}</td>
    <td>{{ hom.next_action_due or "—" }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni homologacijskih zapisov.</i></p>
{% endif %}

<!-- CoC -->
<h2>2. Certificate of Conformity (CoC)</h2>
{% if coc_certs %}
<table>
  <tr><th>Številka CoC</th><th>Izdan</th><th>Velja do</th><th>Organ</th></tr>
  {% for coc in coc_certs %}
  <tr>
    <td><b>{{ coc.coc_number }}</b></td>
    <td>{{ coc.issued_at }}</td>
    <td>{{ coc.valid_until or "—" }}</td>
    <td>{{ coc.issuing_body or "—" }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p><i>Ni CoC certifikatov.</i></p>
{% endif %}

<div class="footer">
  eVersum Vehicle Compliance &amp; Tracking System | Homologacijsko Poročilo | {{ generated_at }}<br>
  UNECE R155 (Cybersecurity) | UNECE R156 (Software Updates) | Skladno z EC 2018/858
</div>
</body>
</html>
"""


async def generate_hom_report_pdf(db: AsyncSession, vehicle_id: uuid.UUID, org_id: uuid.UUID) -> bytes:
    """Homologacijsko poročilo za GR organ / TÜV (UNECE R155/R156)."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise ValueError("Vozilo ne obstaja")

    result = await db.execute(
        select(Homologation)
        .where(Homologation.vehicle_id == vehicle_id)
        .order_by(Homologation.regulation)
    )
    homologations = result.scalars().all()

    result = await db.execute(
        select(CoCCertificate)
        .where(CoCCertificate.vehicle_id == vehicle_id)
        .order_by(CoCCertificate.issued_at.desc())
    )
    coc_certs = result.scalars().all()

    env = Environment(loader=BaseLoader())
    template = env.from_string(HOM_HTML_TEMPLATE)
    html = template.render(
        vehicle=vehicle,
        homologations=homologations,
        coc_certs=coc_certs,
        generated_at=datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC"),
    )

    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except ImportError:
        return html.encode("utf-8")
