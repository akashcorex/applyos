"""Celery application configured with Redis broker/backend."""

from celery import Celery

from app.config import settings

celery_app = Celery(
    "apply_agent",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.apply_worker",
        "app.workers.connect_worker",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)
