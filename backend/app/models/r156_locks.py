"""
Zaklep izdanih RXSWIN baseline-ov na nivoju baze (R156 §7.1.2.3 — revizijsko sledljiv register).

API zaklep preverja že sam, triggerji pa zagotovijo, da izdanega zapisa ne spremeni
nihče — tudi ne neposreden SQL ali napaka v kodi. Dovoljen je en sam prehod:
released → superseded, ko se izda naslednji baseline.

Isti SQL uporablja migracija 006; tukaj je vezan na metapodatke, da ga dobi tudi
testna baza, ki se gradi s create_all.
"""

from sqlalchemy import DDL, event

from app.models.r156 import RXSWINBaseline, RXSWINBaselineItem

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

# asyncpg ne sprejme več ukazov v enem klicu — vsak ukaz posebej.
# DDL() formatira niz z %, zato se % iz RAISE podvoji.
for _stmt in BASELINE_LOCK_SQL:
    event.listen(RXSWINBaseline.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
for _stmt in ITEM_LOCK_SQL:
    event.listen(RXSWINBaselineItem.__table__, "after_create", DDL(_stmt.replace("%", "%%")))
