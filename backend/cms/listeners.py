"""
cms/listeners.py
~~~~~~~~~~~~~~~~
Event listeners for the CMS module.

These handlers react to events fired by other modules (inventory, accounting, etc.)
and update CMS state accordingly — without importing from those modules directly.

EventBus is not yet implemented in core (Phase 3).  When core.events is available,
uncomment the @listens_to decorators and register this file in core/apps.py
autodiscovery.

Pattern (once EventBus is live):

    from core.events import listens_to
    from .models import CMSSite, CMSPage

    @listens_to('inventory.product.published', module_id='cms')
    def on_product_published(payload: dict, tenant) -> None:
        ...

Relevant events this module should react to:
  inventory.product.published  → refresh public product catalogue page
  inventory.product.updated    → invalidate cached catalogue
  tenant.suspended             → unpublish the tenant's site
  subscription.changed         → check if cms module is still active; unpublish if not
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


# ── Stub: inventory.product.published ─────────────────────────────────────────
# When an inventory product is published to the public catalogue, refresh the
# cached product list for the tenant's CMS site.
#
# @listens_to('inventory.product.published', module_id='cms')
# def on_product_published(payload: dict, tenant) -> None:
#     from .models import CMSSite
#     site = CMSSite.objects.for_tenant(tenant).filter(is_published=True).first()
#     if not site:
#         return
#     # Invalidate catalogue cache so the next public request fetches fresh data
#     from django.core.cache import cache
#     cache.delete(f'cms:catalogue:{tenant.id}')
#     logger.info("CMS catalogue cache invalidated for tenant %s (product published)", tenant.id)


# ── Stub: inventory.product.updated ───────────────────────────────────────────
# @listens_to('inventory.product.updated', module_id='cms')
# def on_product_updated(payload: dict, tenant) -> None:
#     from django.core.cache import cache
#     cache.delete(f'cms:catalogue:{tenant.id}')
#     logger.info("CMS catalogue cache invalidated for tenant %s (product updated)", tenant.id)


# ── Stub: tenant.suspended ────────────────────────────────────────────────────
# When a tenant is suspended take their public website offline so it stops
# serving traffic — avoids misleading "business closed" content from remaining
# publicly visible.
#
# @listens_to('tenant.suspended', module_id='cms')
# def on_tenant_suspended(payload: dict, tenant) -> None:
#     from django.utils import timezone
#     from .models import CMSSite
#     updated = CMSSite.objects.for_tenant(tenant).filter(is_published=True).update(
#         is_published=False
#     )
#     if updated:
#         logger.warning(
#             "CMS site unpublished for suspended tenant %s (%s site(s) taken offline)",
#             tenant.id, updated,
#         )


# ── Stub: subscription.changed ────────────────────────────────────────────────
# If the plan change removes the CMS module, take the site offline gracefully.
#
# @listens_to('subscription.changed', module_id='cms')
# def on_subscription_changed(payload: dict, tenant) -> None:
#     # Re-check whether cms is still in the tenant's active module set
#     tenant.refresh_from_db()
#     if 'cms' not in tenant.active_modules_set:
#         from .models import CMSSite
#         CMSSite.objects.for_tenant(tenant).filter(is_published=True).update(is_published=False)
#         logger.info(
#             "CMS site unpublished for tenant %s — cms module no longer active after plan change",
#             tenant.id,
#         )
