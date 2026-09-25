"""
PDF poročila za R156 SUMS.

- readme programske datoteke ECU — enaka zgradba kot readme iz Helix ALM, ki ga
  eVersum hrani v mapi ECU na Egnyte (glej 'VCU ES03v02_vcu1_1_2_115 Readme.pdf')
- Software Update dokument — celoten zapis po §7.1.2.5 kot dokaz za presojo

Besedilo poročil je v angleščini (dokumenti gredo naročniku in TÜV).
Jinja teče z autoescape — vsebina polj je uporabniški vnos.
"""

from datetime import datetime, timezone

from jinja2 import Environment

_env = Environment(autoescape=True, trim_blocks=True, lstrip_blocks=True)


def _fmt_dt(v) -> str:
    if not v:
        return "—"
    if isinstance(v, str):
        return v
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).strftime("%d %b %Y %H:%M UTC")
    return v.strftime("%d %b %Y")


_env.filters["dt"] = _fmt_dt

BASE_CSS = """
@page { size: A4; margin: 22mm 20mm 20mm 20mm;
        @bottom-right { content: counter(page) " / " counter(pages); font: 8pt "DejaVu Sans", sans-serif; color: #666; }
        @bottom-left { content: string(doctitle); font: 8pt "DejaVu Sans", sans-serif; color: #666; } }
body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 9.5pt; color: #111; }
h1 { font-size: 20pt; margin: 0 0 6mm 0; string-set: doctitle content(); }
h2 { font-size: 12pt; color: #2d5d9f; margin: 8mm 0 3mm 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; }
.brand { font-size: 18pt; font-weight: bold; letter-spacing: 0.5px; color: #1f2937; }
.brand span { color: #0ea5e9; }
.cover { height: 235mm; position: relative; page-break-after: always; }
.cover .title { margin-top: 55mm; }
.cover .meta { position: absolute; bottom: 0; }
table.kv { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
table.kv td { border: 1px solid #9ca3af; padding: 2.2mm 3mm; vertical-align: top; }
table.kv td.k { width: 30%; background: #f3f4f6; font-weight: bold; }
table.grid { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
table.grid th, table.grid td { border: 1px solid #9ca3af; padding: 1.8mm 2mm; text-align: left; vertical-align: top; }
table.grid th { background: #e5e7eb; }
.mono { font-family: "DejaVu Sans Mono", monospace; font-size: 8.5pt; word-break: break-all; }
.pre { white-space: pre-wrap; }
.status { display: inline-block; padding: 0.5mm 2mm; border-radius: 2mm; font-weight: bold; font-size: 8.5pt; }
.released { background: #dcfce7; color: #166534; }
.draft { background: #fef3c7; color: #92400e; }
.superseded { background: #e5e7eb; color: #374151; }
.watermark { color: #b45309; font-weight: bold; }
.small { font-size: 8pt; color: #4b5563; }
"""

README_TEMPLATE = """
<html><head><meta charset="utf-8"><style>{{ css|safe }}</style></head><body>
<div class="cover">
  <div class="brand">e<span>V</span>ersum</div>
  <div class="title">
    <h1>{{ ecu_short }} {{ item.sw_version }} - Readme</h1>
    <p><b>Description:</b><br>
    This document states the SW version, SHA-256 checksum of the SW file and any parameters files
    (if applicable), as well as compatible hardware and change log.</p>
  </div>
  <div class="meta">
    <p><b>RXSWIN:</b> {{ rxswin.rxswin }}<br>
    <b>Baseline Number:</b> {{ baseline.baseline_number }}<br>
    <b>Status:</b> <span class="status {{ baseline.status }}">{{ baseline.status|upper }}</span><br>
    <b>Released:</b> {{ baseline.released_at|dt }}{% if baseline.released_by_name %} by {{ baseline.released_by_name }}{% endif %}<br>
    <b>Generated:</b> {{ generated|dt }}</p>
    {% if baseline.status != "released" %}
    <p class="watermark">{% if baseline.status == "draft" %}DRAFT — not released, not valid for flashing.{% else %}SUPERSEDED — a newer baseline exists.{% endif %}</p>
    {% endif %}
    <p class="small"><b>eVersum SUMS</b> | UN R156 Software Update Management System</p>
  </div>
</div>

<h1 style="color:#2d5d9f; font-size:16pt">{{ ecu_short }} {{ item.sw_version }} - Readme</h1>
<p><b>RXSWIN:</b> {{ rxswin.rxswin }} &nbsp; <b>Baseline Number:</b> {{ baseline.baseline_number }}
&nbsp; <b>Status:</b> <span class="status {{ baseline.status }}">{{ baseline.status|upper }}</span></p>
<p>The following table aggregates the content of the software file readme for eVersum {{ ecu_short }} SW:</p>
<table class="kv">
  <tr><td class="k">ECU</td><td>{{ item.ecu_name }}</td></tr>
  <tr><td class="k">ECU eVersum Part Number</td><td>{{ item.eversum_part_number }}</td></tr>
  {% if item.supplier %}<tr><td class="k">Supplier</td><td>{{ item.supplier }}</td></tr>{% endif %}
  <tr><td class="k">SW Version</td><td>{{ item.sw_version }}</td></tr>
  <tr><td class="k">Description</td><td>{{ item.description or "—" }}</td></tr>
  <tr><td class="k">SW File name (include extension)</td><td>{{ item.sw_file_name or "—" }}</td></tr>
  <tr><td class="k">SW File SHA-256 Checksum</td><td class="mono">{{ item.sw_file_sha256 or "—" }}</td></tr>
  <tr><td class="k">SW Config Parameters file (if applicable)</td><td>{{ config_file }}</td></tr>
  <tr><td class="k">SW Config File SHA-256 Checksum (if applicable)</td><td class="mono">{{ item.sw_config_sha256 or "N/A" }}</td></tr>
  <tr><td class="k">Change Log</td><td class="pre">{{ item.change_log or "—" }}</td></tr>
  <tr><td class="k">Compatible Hardware</td><td>{{ item.compatible_hardware or "—" }}</td></tr>
  {% if item.egnyte_folder_url %}<tr><td class="k">Software repository</td><td class="mono">{{ item.egnyte_folder_url }}</td></tr>{% endif %}
</table>
</body></html>
"""

SU_TEMPLATE = """
<html><head><meta charset="utf-8"><style>{{ css|safe }}</style></head><body>
<div class="brand">e<span>V</span>ersum</div>
<h1>{{ d.document_id }} rev. {{ d.revision }} — {{ d.title }}</h1>
<p><b>Status:</b> <span class="status {{ d.status }}">{{ d.status|upper }}</span>
&nbsp; <b>Vehicle type:</b> {{ d.vehicle_type_name }}
&nbsp; <b>Released:</b> {{ d.released_at|dt }}{% if d.released_by_name %} by {{ d.released_by_name }}{% endif %}</p>
{% if d.status == "draft" %}<p class="watermark">DRAFT — not released.</p>{% endif %}
<p class="small">Software Update record according to UN R156 §7.1.2.5. Generated {{ generated|dt }} from eVersum SUMS.</p>

<h2>1. Purpose and dependencies — §7.1.2.5 (a), §7.1.1.5</h2>
<table class="kv">
  <tr><td class="k">Purpose of the update</td><td class="pre">{{ d.description_purpose }}</td></tr>
  <tr><td class="k">Dependencies identified</td><td class="pre">{{ d.dependencies_identified or "—" }}</td></tr>
  <tr><td class="k">System schemes baseline</td><td>{{ d.system_schemes_baseline or "—" }}</td></tr>
  <tr><td class="k">New hardware required</td><td>{{ "Yes" if d.new_hardware_required else "No" }}</td></tr>
</table>

<h2>2. Affected RXSWINs — §7.1.2.3</h2>
<table class="grid">
  <tr><th>RXSWIN</th><th>Baseline before</th><th>Baseline after</th><th>Status of new baseline</th></tr>
  {% for a in d.affected_rxswins %}
  <tr><td>{{ a.rxswin }}</td><td>{{ a.baseline_before_number or "—" }}</td><td>{{ a.baseline_after_number or "—" }}</td><td>{{ a.baseline_after_status or "—" }}</td></tr>
  {% else %}<tr><td colspan="4">—</td></tr>{% endfor %}
</table>

<h2>3. Verification and validation — §7.1.3.3, §7.1.2.5 (i)</h2>
<table class="kv">
  <tr><td class="k">V&amp;V status</td><td>{{ d.vv_status|upper }}</td></tr>
  <tr><td class="k">Method / evidence</td><td class="pre">{{ d.vv_method or "—" }}</td></tr>
  <tr><td class="k">Signed by</td><td>{{ d.vv_signed_by_name or "—" }}, {{ d.vv_signed_at|dt }}</td></tr>
</table>

<h2>4. Type approval — §7.1.1.8–10, §7.1.2.5 (c)–(f)</h2>
<table class="kv">
  <tr><td class="k">Type approval update necessary</td><td>{{ "—" if d.type_approval_update_necessary is none else ("Yes" if d.type_approval_update_necessary else "No") }}</td></tr>
  <tr><td class="k">Justification</td><td class="pre">{{ d.type_approval_justification or "—" }}</td></tr>
  <tr><td class="k">Affected UN-ECE requirements</td><td>{{ d.unece_affected_requirements|join(", ") or "—" }}</td></tr>
  <tr><td class="k">Approval granted</td><td>{{ "—" if d.type_approval_granted is none else ("Yes" if d.type_approval_granted else "No") }}{% if d.type_approval_number %} — {{ d.type_approval_number }}, {{ d.type_approval_date|dt }}{% endif %}</td></tr>
</table>

<h2>5. Execution and safety — §7.1.2.5 (g), (h)</h2>
<table class="kv">
  <tr><td class="k">Execution conditions</td><td class="pre">{{ d.execution_conditions or "—" }}</td></tr>
  <tr><td class="k">Safe state conditions</td><td class="pre">{{ d.safe_state_conditions or "—" }}</td></tr>
  <tr><td class="k">Actions required from the user / a competent person</td><td class="pre">{{ d.user_actions_required or "—" }}</td></tr>
  <tr><td class="k">Safety / security confirmation</td><td class="pre">{{ d.safety_security_confirmation or "—" }}</td></tr>
</table>

<h2>6. User notification — §7.1.1.11</h2>
<table class="kv">
  <tr><td class="k">Notification required</td><td>{{ "Yes" if d.user_notification_required else "No" }}</td></tr>
  <tr><td class="k">Notified</td><td>{% if d.user_notified_at %}{{ d.user_notified_at|dt }} by {{ d.user_notified_by_name or "—" }} — {{ d.user_notification_method }}{% else %}—{% endif %}</td></tr>
</table>

<h2>7. Target vehicles — §7.1.1.6, §7.1.1.7, §7.1.2.4</h2>
<table class="grid">
  <tr><th>VIN</th><th>Vehicle</th><th>Last known configuration</th><th>Compatibility confirmed</th><th>Result</th></tr>
  {% for t in d.targets %}
  <tr><td class="mono">{{ t.vin }}</td><td>{{ t.vehicle_name }}</td>
      <td>{{ t.current_config_id or "—" }}<br><span class="small">{{ {"ok": "matches baseline before", "mismatch": "DOES NOT match baseline before", "already_installed": "update already installed", "unknown": "no configuration recorded"}[t.precondition] }}{% if t.precondition_detail %} ({{ t.precondition_detail|join("; ") }}){% endif %}</span></td>
      <td>{% if t.compatibility_confirmed %}Yes — {{ t.confirmed_by_name or "—" }}, {{ t.confirmed_at|dt }}{% else %}No{% endif %}{% if t.compatibility_notes %}<br><span class="small">{{ t.compatibility_notes }}</span>{% endif %}</td>
      <td>{% if t.result %}{{ t.result }} — {{ t.applied_by_name or "—" }}, {{ t.applied_at|dt }}{% else %}pending{% endif %}</td></tr>
  {% else %}<tr><td colspan="5">—</td></tr>{% endfor %}
</table>

<h2>8. References</h2>
<table class="kv">
  <tr><td class="k">ERP work order</td><td>{{ d.erp_work_order or "—" }}{% if d.erp_work_order_url %}<br><span class="mono">{{ d.erp_work_order_url }}</span>{% endif %}</td></tr>
  <tr><td class="k">Software repository (Egnyte)</td><td class="mono">{{ d.egnyte_folder_url or "—" }}</td></tr>
  <tr><td class="k">Created</td><td>{{ d.created_at|dt }}{% if d.created_by_name %} by {{ d.created_by_name }}{% endif %}</td></tr>
</table>
</body></html>
"""


def _pdf(html: str) -> bytes:
    from weasyprint import HTML

    return HTML(string=html).write_pdf()


def ecu_short_name(ecu_name: str) -> str:
    """'Vehicle Control Unit' → 'VCU' (kot v Helix naslovih); kratka imena ostanejo."""
    words = ecu_name.split()
    if len(words) >= 2 and all(w[:1].isupper() for w in words):
        return "".join(w[0] for w in words)
    return ecu_name


def render_readme_pdf(rxswin, baseline, item) -> bytes:
    config_file = item.sw_config_file_name or (item.sw_config_version if item.sw_config_version else "N/A")
    html = _env.from_string(README_TEMPLATE).render(
        css=BASE_CSS, rxswin=rxswin, baseline=baseline, item=item, config_file=config_file,
        ecu_short=ecu_short_name(item.ecu_name), generated=datetime.now(timezone.utc),
    )
    return _pdf(html)


def render_software_update_pdf(detail) -> bytes:
    html = _env.from_string(SU_TEMPLATE).render(css=BASE_CSS, d=detail, generated=datetime.now(timezone.utc))
    return _pdf(html)
