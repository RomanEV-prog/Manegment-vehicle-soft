"""
Ustvari uporabnika z naključnim geslom (za strežnike brez demo podatkov).

Organizacija se ustvari, če še ne obstaja. Geslo se izpiše enkrat — shrani ga.
Obstoječemu uporabniku z --reset-password nastavi novo naključno geslo.

  docker compose exec api python -m app.scripts.create_user \\
      --email jakub@example.com --name "Jakub Zdun" --role qc_manager
"""

import argparse
import asyncio
import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.organization import Organization
from app.models.user import User
from app.utils.audit import write_audit_log
from app.utils.security import hash_password

ROLES = ("admin", "qc_manager", "technician", "partner_viewer")


async def main(email: str, name: str, role: str, org_name: str, reset_password: bool) -> None:
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    password = secrets.token_urlsafe(12)

    async with Session() as db:
        org = await db.scalar(select(Organization).where(Organization.name == org_name))
        if org is None:
            org = Organization(name=org_name, type="oem")
            db.add(org)
            await db.flush()
            print(f"Organizacija '{org_name}' ustvarjena.")

        user = await db.scalar(select(User).where(User.email == email))
        if user is not None:
            if not reset_password:
                raise SystemExit(f"Uporabnik {email} že obstaja (za novo geslo dodaj --reset-password)")
            user.password_hash = hash_password(password)
            user.password_changed_at = datetime.now(timezone.utc).replace(microsecond=0)
            user.is_active = True
            action = "reset_password"
        else:
            user = User(
                organization_id=org.id,
                email=email,
                full_name=name,
                role=role,
                password_hash=hash_password(password),
            )
            db.add(user)
            await db.flush()
            action = "create"

        await write_audit_log(
            db=db,
            org_id=user.organization_id,
            actor_id=None,
            actor_type="system",
            actor_device="cli",
            action="update" if action == "reset_password" else "create",
            entity_type="user",
            entity_id=user.id,
            after={"email": user.email, "role": user.role, "via": "create_user"},
        )
        await db.commit()

    await engine.dispose()
    print(f"{'Novo geslo' if action == 'reset_password' else 'Uporabnik ustvarjen'}: {email} ({user.role})")
    print(f"Geslo: {password}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--role", choices=ROLES, default="qc_manager")
    p.add_argument("--org", default="eVersum")
    p.add_argument("--reset-password", action="store_true")
    a = p.parse_args()
    asyncio.run(main(a.email.strip().lower(), a.name.strip(), a.role, a.org, a.reset_password))
