"""
Celery application entry point.

Import this module in config/__init__.py so Django auto-discovers tasks.
"""
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')

app = Celery('techyatra')

# Read config from Django settings, namespace all Celery keys with CELERY_
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all INSTALLED_APPS
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Diagnostic task — not used in production."""
    pass
