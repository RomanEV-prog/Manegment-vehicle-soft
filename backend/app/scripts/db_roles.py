"""
Omejena vloga baze za aplikacijo (zažene se ob vsakem zagonu API-ja, po migracijah).

Aplikacija se na strežniku povezuje kot `eversum_app`:
  - ni superuser in ni lastnik tabel → ne more izklopiti triggerjev zaklepa
    (ALTER TABLE ... DISABLE TRIGGER, session_replication_role), ne more TRUNCATE
  - audit_logs: samo SELECT in INSERT
Migracije in varnostne kopije tečejo kot lastnik (POSTGRES_USER).

Okolje:
  MIGRATION_DATABASE_URL  povezava lastnika (postgresql+asyncpg://eversum:...@db/eversum_db)
  APP_DB_PASSWORD         geslo vloge eversum_app
Brez teh spremenljivk skripta ne naredi ničesar (lokalni razvoj).
"""

import asyncio
import os
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ROLE = "eversum_app"


async def main() -> None:
    url = os.environ.get("MIGRATION_DATABASE_URL")
    password = os.environ.get("APP_DB_PASSWORD")
    if not url or not password:
        print("db_roles: MIGRATION_DATABASE_URL / APP_DB_PASSWORD nista nastavljena — preskočeno")
        return
    if not re.fullmatch(r"[A-Za-z0-9_\-]{16,}", password):
        raise SystemExit("db_roles: APP_DB_PASSWORD mora imeti vsaj 16 znakov [A-Za-z0-9_-]")

    engine = create_async_engine(url)
    async with engine.begin() as conn:
        exists = await conn.scalar(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": ROLE})
        if not exists:
            await conn.execute(text(f"CREATE ROLE {ROLE}"))
        # geslo je preverjeno zgoraj (samo varni znaki) — ALTER ROLE ne sprejme parametra
        await conn.execute(text(
            f"ALTER ROLE {ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION "
            f"PASSWORD '{password}'"
        ))
        for stmt in (
            f"GRANT CONNECT ON DATABASE {await conn.scalar(text('SELECT current_database()'))} TO {ROLE}",
            f"GRANT USAGE ON SCHEMA public TO {ROLE}",
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {ROLE}",
            f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {ROLE}",
            # revizijska sled: samo branje in dodajanje
            f"REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM {ROLE}",
            f"REVOKE ALL ON alembic_version FROM {ROLE}",
        ):
            await conn.execute(text(stmt))
    await engine.dispose()
    print(f"db_roles: vloga {ROLE} pripravljena")


if __name__ == "__main__":
    asyncio.run(main())
