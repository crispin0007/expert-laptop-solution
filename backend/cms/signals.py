"""
cms/signals.py
~~~~~~~~~~~~~~
Django signals for the CMS module.

Phase 1 signals
---------------
- When a CMSGenerationJob is created with status=QUEUED → dispatch Celery task.
- When a CMSCustomDomain is saved (new, unverified) → dispatch Celery verification task.

Do NOT import tasks at module level — use dotted-string form or lazy import
to avoid circular imports during app startup.
"""
from __future__ import annotations
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='cms.CMSGenerationJob')
def on_generation_job_created(sender, instance, created: bool, **kwargs) -> None:
    """
    Dispatch the AI generation Celery task when a new job is queued.
    Only fires on creation so retries don't spawn duplicate tasks.
    """
    if not created:
        return
    from .models import CMSGenerationJob
    if instance.status == CMSGenerationJob.STATUS_QUEUED:
        from .tasks import task_run_ai_generation
        task_run_ai_generation.delay(instance.pk)
        logger.info("Enqueued AI generation task for job %s (site %s)", instance.pk, instance.site_id)


@receiver(post_save, sender='cms.CMSCustomDomain')
def on_custom_domain_saved(sender, instance, created: bool, **kwargs) -> None:
    """
    Trigger domain verification task when a brand-new domain record is saved.
    If the domain is verified on creation (edge case), skip.
    """
    if not created:
        return
    if instance.is_verified:
        return
    from .tasks import task_verify_custom_domain
    task_verify_custom_domain.delay(instance.pk)
    logger.info("Enqueued domain verification task for domain %s (id=%s)", instance.domain, instance.pk)
