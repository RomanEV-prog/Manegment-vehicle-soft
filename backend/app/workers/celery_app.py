from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "eversum",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.twin_worker",
        "app.workers.alarm_worker",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Ljubljana",
    enable_utc=True,
)

# Scheduled tasks
celery_app.conf.beat_schedule = {
    "daily-alarm-check": {
        "task": "app.workers.alarm_worker.daily_alarm_check",
        "schedule": crontab(hour=7, minute=0),  # vsako jutro ob 7:00
    },
}
