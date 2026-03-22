"""
Redis Streams event consumer.
Bere evente iz EVERSUM:EVENTS streama in jih procesira.

Zaženi kot ločen proces:
    python -m app.workers.event_consumer
"""
import asyncio
import logging
import signal
import sys

import redis.asyncio as aioredis

from app.config import settings

log = logging.getLogger(__name__)

STREAM_KEY = "eversum:events"
CONSUMER_GROUP = "eversum-workers"
CONSUMER_NAME = "consumer-1"


async def process_event(event_type: str, fields: dict) -> None:
    """
    Procesira event iz streama.
    Event types:
        sw_update.created  → twin update + alarm check
        dtc.created        → twin update + alarm (high severity)
        dtc.resolved       → twin update
        service.created    → twin update
        homologation.updated → twin update
        vehicle.shipped    → shipment snapshot
    """
    vehicle_id = fields.get("vehicle_id")
    org_id = fields.get("org_id")
    trigger_id = fields.get("trigger_id")

    if not vehicle_id or not org_id:
        return

    from app.workers.twin_worker import update_vehicle_twin
    from app.workers.alarm_worker import check_dtc_alarm

    if event_type == "sw_update.created":
        if trigger_id:
            update_vehicle_twin.delay(vehicle_id, "sw_update", trigger_id)
        log.info(f"SW update event: vehicle={vehicle_id}")

    elif event_type == "dtc.created":
        severity = fields.get("severity", "low")
        if trigger_id:
            update_vehicle_twin.delay(vehicle_id, "dtc", trigger_id)
            if severity == "high":
                check_dtc_alarm.delay(trigger_id, org_id)
        log.info(f"DTC created event: vehicle={vehicle_id} severity={severity}")

    elif event_type == "dtc.resolved":
        if trigger_id:
            update_vehicle_twin.delay(vehicle_id, "dtc", trigger_id)
        log.info(f"DTC resolved event: vehicle={vehicle_id}")

    elif event_type == "service.created":
        if trigger_id:
            update_vehicle_twin.delay(vehicle_id, "service", trigger_id)
        log.info(f"Service created event: vehicle={vehicle_id}")

    elif event_type == "homologation.updated":
        if trigger_id:
            update_vehicle_twin.delay(vehicle_id, "homologation", trigger_id)
        log.info(f"Homologation updated event: vehicle={vehicle_id}")

    elif event_type == "vehicle.shipped":
        # Ustvari shipment snapshot
        from app.workers.twin_worker import update_vehicle_twin
        update_vehicle_twin.delay(vehicle_id, "manual", vehicle_id)
        log.info(f"Vehicle shipped event: vehicle={vehicle_id} — shipment snapshot created")

    else:
        log.debug(f"Nepoznan event tip: {event_type}")


async def run_consumer():
    """Glavna zanka event consumerja."""
    redis = aioredis.from_url(settings.redis_url)

    # Ustvari consumer group če ne obstaja
    try:
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        log.info(f"Consumer group '{CONSUMER_GROUP}' ustvarjena")
    except Exception as e:
        if "BUSYGROUP" in str(e):
            log.info(f"Consumer group '{CONSUMER_GROUP}' že obstaja")
        else:
            log.error(f"Napaka pri kreiranju consumer group: {e}")

    log.info(f"Event consumer zagnan — stream: {STREAM_KEY}")

    running = True

    def handle_signal(sig, frame):
        nonlocal running
        log.info("Prejel signal za zaustavitev...")
        running = False

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    while running:
        try:
            # Preberi nove evente (blokira do 2 sekundi)
            messages = await redis.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_KEY: ">"},
                count=10,
                block=2000,
            )

            if not messages:
                continue

            for stream_name, stream_messages in messages:
                for msg_id, fields in stream_messages:
                    event_type = fields.get("type", "unknown")
                    try:
                        await process_event(event_type, fields)
                        # Potrdi procesiranje
                        await redis.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
                    except Exception as e:
                        log.error(f"Napaka pri procesiranju eventa {msg_id}: {e}")
                        # Ne potrdi — bo reprocessed

        except asyncio.CancelledError:
            break
        except Exception as e:
            log.error(f"Consumer napaka: {e}")
            await asyncio.sleep(5)

    await redis.aclose()
    log.info("Event consumer zaustavljen")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_consumer())
