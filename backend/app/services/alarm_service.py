"""
Alarm service — dostava obvestil (email, push, SMS).
"""
import uuid

import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User


async def send_email_alarm(
    db: AsyncSession,
    org_id: uuid.UUID,
    subject: str,
    body: str,
    roles: list[str] | None = None,
) -> None:
    """Pošlji email vsem qc_manager in admin uporabnikom organizacije."""
    target_roles = roles or ["qc_manager", "admin"]
    result = await db.execute(
        select(User).where(
            User.organization_id == org_id,
            User.role.in_(target_roles),
            User.is_active == True,
        )
    )
    recipients = result.scalars().all()

    if not recipients or not settings.smtp_password:
        return  # SMTP ni konfiguriran — preskoči v dev okolju

    for user in recipients:
        msg = MIMEMultipart()
        msg["From"] = settings.email_from
        msg["To"] = user.email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                start_tls=True,
            )
        except Exception as e:
            # Ne blokiraj — samo logiraj
            import logging
            logging.getLogger(__name__).error(f"Email napaka za {user.email}: {e}")


async def publish_ws_alarm(org_id: str, payload: dict) -> None:
    """Objavi alarm na Redis pub/sub → WebSocket broadcast."""
    import json
    import redis.asyncio as aioredis

    redis = aioredis.from_url(settings.redis_url)
    try:
        await redis.publish(f"alarms:{org_id}", json.dumps(payload))
    finally:
        await redis.aclose()


# Singleton za Firebase Admin SDK — inicializiramo enkrat
_firebase_app = None

def _get_firebase_app():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app
    if not settings.firebase_credentials_json:
        return None
    try:
        import json
        import firebase_admin
        from firebase_admin import credentials
        cred_dict = json.loads(settings.firebase_credentials_json)
        cred = credentials.Certificate(cred_dict)
        _firebase_app = firebase_admin.initialize_app(cred)
        return _firebase_app
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Firebase init napaka: {e}")
        return None


async def send_push_notification(
    db: AsyncSession,
    org_id: uuid.UUID,
    title: str,
    body: str,
    data: dict | None = None,
    roles: list[str] | None = None,
) -> None:
    """Pošlji FCM push notifikacijo vsem uporabnikom z registriranim fcm_token."""
    app = _get_firebase_app()
    if app is None:
        return  # FCM ni konfiguriran

    from firebase_admin import messaging
    import logging
    log = logging.getLogger(__name__)

    target_roles = roles or ["qc_manager", "admin", "technician"]
    result = await db.execute(
        select(User).where(
            User.organization_id == org_id,
            User.role.in_(target_roles),
            User.is_active == True,
            User.fcm_token.isnot(None),
        )
    )
    users = result.scalars().all()

    for user in users:
        try:
            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data={k: str(v) for k, v in (data or {}).items()},
                token=user.fcm_token,
                android=messaging.AndroidConfig(priority="high"),
                apns=messaging.APNSConfig(
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(sound="default", badge=1)
                    )
                ),
            )
            messaging.send(message)
        except Exception as e:
            log.error(f"FCM napaka za {user.email}: {e}")
