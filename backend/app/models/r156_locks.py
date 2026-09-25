"""
Zaklep izdanih RXSWIN baseline-ov na nivoju baze (R156 §7.1.2.3 — revizijsko sledljiv register).

API zaklep preverja že sam, triggerji pa zagotovijo, da izdanega zapisa ne spremeni
nihče — tudi ne neposreden SQL ali napaka v kodi. Dovoljen je en sam prehod:
released → superseded, ko se izda naslednji baseline.

Isti SQL uporablja migracija 006; tukaj je vezan na metapodatke, da ga dobi tudi
testna baza, ki se gradi s create_all.
"""

from sqlalchemy import DDL, event

from app.models.r156 import (
    RXSWINBaseline,
    RXSWINBaselineItem,
    SoftwareUpdateDocument,
    VehicleConfiguration,
)
from app.database import Base
from app.models.audit_log import AuditLog

BASELINE_LOCK_SQL = [
    """
CREATE OR REPLACE FUNCTION rxswin_baseline_lock() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'RXSWIN baseline % je zaklenjen (%)', OLD.baseline_number, OLD.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status = 'released' THEN
        IF NEW.status = 'superseded'
           AND NEW.rxswin_id = OLD.rxswin_id
           AND NEW.baseline_number = OLD.baseline_number
           AND NEW.notes IS NOT DISTINCT FROM OLD.notes
           AND NEW.released_at IS NOT DISTINCT FROM OLD.released_at
           AND NEW.released_by IS NOT DISTINCT FROM OLD.released_by
           AND NEW.integrity_method = OLD.integrity_method THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'RXSWIN baseline % je izdan in samo za branje', OLD.baseline_number
            USING ERRCODE = 'check_violation';
    ELSIF OLD.status = 'superseded' THEN
        RAISE EXCEPTION 'RXSWIN baseline % je nadomeščen in samo za branje', OLD.baseline_number
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
""",
    "DROP TRIGGER IF EXISTS trg_rxswin_baseline_lock ON rxswin_baselines",
    """CREATE TRIGGER trg_rxswin_baseline_lock
    BEFORE UPDATE OR DELETE ON rxswin_baselines
    FOR EACH ROW EXECUTE FUNCTION rxswin_baseline_lock()""",
]

ITEM_LOCK_SQL = [
    """
CREATE OR REPLACE FUNCTION rxswin_baseline_item_lock() RETURNS trigger AS $$
DECLARE
    st text;
BEGIN
    SELECT status INTO st FROM rxswin_baselines
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.baseline_id ELSE NEW.baseline_id END;
    IF st IS NOT NULL AND st <> 'draft' THEN
        RAISE EXCEPTION 'Postavke izdanega RXSWIN baseline-a ni mogoče spreminjati (%)', st
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.baseline_id <> OLD.baseline_id THEN
        RAISE EXCEPTION 'Postavke ni mogoče prestaviti v drug baseline'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql
""",
    "DROP TRIGGER IF EXISTS trg_rxswin_baseline_item_lock ON rxswin_baseline_items",
    """CREATE TRIGGER trg_rxswin_baseline_item_lock
    BEFORE INSERT OR UPDATE OR DELETE ON rxswin_baseline_items
    FOR EACH ROW EXECUTE FUNCTION rxswin_baseline_item_lock()""",
]

# ─── Software Update dokument (R156 §7.1.2.5) ────────────────────────────────
# Izdan dokument je samo za branje. Dovoljeno: prehod released → superseded in
# zapis obvestila uporabniku (§7.1.1.11 — zgodi se po izdaji).
SU_LOCK_SQL = [
    """
CREATE OR REPLACE FUNCTION software_update_lock() RETURNS trigger AS $$
DECLARE
    allowed text[] := ARRAY['status', 'updated_at', 'user_notified_at', 'user_notified_by',
                            'user_notification_method'];
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Software Update % rev. % je zaklenjen (%)', OLD.document_id, OLD.baseline_number, OLD.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - allowed) <> (to_jsonb(OLD) - allowed)
       OR NOT (NEW.status = OLD.status OR (OLD.status = 'released' AND NEW.status = 'superseded')) THEN
        RAISE EXCEPTION 'Software Update % rev. % je izdan in samo za branje', OLD.document_id, OLD.baseline_number
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
""",
    "DROP TRIGGER IF EXISTS trg_software_update_lock ON software_updates",
    """CREATE TRIGGER trg_software_update_lock
    BEFORE UPDATE OR DELETE ON software_updates
    FOR EACH ROW EXECUTE FUNCTION software_update_lock()""",
]

# Prizadeti RXSWIN-i in ciljna vozila sledijo statusu dokumenta. Po izdaji se pri
# ciljnem vozilu sme zapisati le izvedba (rezultat, kdaj, kdo).
SU_CHILD_LOCK_SQL = [
    """
CREATE OR REPLACE FUNCTION software_update_child_lock() RETURNS trigger AS $$
DECLARE
    st text;
    st_old text;
    allowed text[] := ARRAY['result', 'applied_at', 'applied_by'];
BEGIN
    SELECT status INTO st FROM software_updates
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.software_update_id ELSE NEW.software_update_id END;
    -- pri UPDATE tudi dokument, iz katerega zapis prihaja (prestavitev iz izdanega v osnutek)
    IF TG_OP = 'UPDATE' THEN
        SELECT status INTO st_old FROM software_updates WHERE id = OLD.software_update_id;
        IF st_old IS NOT NULL AND st_old <> 'draft' THEN
            st := st_old;
        END IF;
    END IF;
    IF st IS NULL OR st = 'draft' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.software_update_id <> OLD.software_update_id THEN
        RAISE EXCEPTION 'Zapisa ni mogoče prestaviti v drug dokument' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'software_update_targets' AND TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - allowed) = (to_jsonb(OLD) - allowed) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Software Update je izdan — % ni mogoče spreminjati', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql
""",
    "DROP TRIGGER IF EXISTS trg_su_rxswin_lock ON software_update_rxswins",
    """CREATE TRIGGER trg_su_rxswin_lock
    BEFORE INSERT OR UPDATE OR DELETE ON software_update_rxswins
    FOR EACH ROW EXECUTE FUNCTION software_update_child_lock()""",
    "DROP TRIGGER IF EXISTS trg_su_target_lock ON software_update_targets",
    """CREATE TRIGGER trg_su_target_lock
    BEFORE INSERT OR UPDATE OR DELETE ON software_update_targets
    FOR EACH ROW EXECUTE FUNCTION software_update_child_lock()""",
]

# ─── Konfiguracija vozila (R156 §7.1.2.2) ─────────────────────────────────────
# Zapis je nespremenljiv: nova konfiguracija = nov zapis. Brez izjem.
CONFIG_LOCK_SQL = [
    """
CREATE OR REPLACE FUNCTION vehicle_configuration_lock() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Konfiguracija vozila % je nespremenljiva (nova konfiguracija = nov zapis)', OLD.config_id
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql
""",
    "DROP TRIGGER IF EXISTS trg_vehicle_configuration_lock ON vehicle_configurations",
    """CREATE TRIGGER trg_vehicle_configuration_lock
    BEFORE UPDATE OR DELETE ON vehicle_configurations
    FOR EACH ROW EXECUTE FUNCTION vehicle_configuration_lock()""",
    # največ ena konfiguracija ob koncu linije na vozilo
    """CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_config_eol
    ON vehicle_configurations (vehicle_id) WHERE config_type = 'initial_eol'""",
]

# ─── Revizijska sled: samo dodajanje ──────────────────────────────────────────
AUDIT_LOCK_SQL = [
    """
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Revizijska sled je samo za dodajanje (%)', TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql
""",
    "DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_logs",
    """CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only()""",
]

# asyncpg ne sprejme več ukazov v enem klicu — vsak ukaz posebej.
# DDL() formatira niz z %, zato se % iz RAISE podvoji.
for _stmt in BASELINE_LOCK_SQL:
    event.listen(RXSWINBaseline.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
for _stmt in ITEM_LOCK_SQL:
    event.listen(RXSWINBaselineItem.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
for _stmt in AUDIT_LOCK_SQL:
    event.listen(AuditLog.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
for _stmt in CONFIG_LOCK_SQL:
    event.listen(VehicleConfiguration.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
for _stmt in SU_LOCK_SQL:
    event.listen(SoftwareUpdateDocument.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
# otroški tabeli morata obstajati obe — trigger se ustvari po celotnem create_all
for _stmt in SU_CHILD_LOCK_SQL:
    event.listen(Base.metadata, "after_create", DDL(_stmt.replace("%", "%%")))
