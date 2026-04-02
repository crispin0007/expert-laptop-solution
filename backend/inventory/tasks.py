"""Inventory Celery tasks."""
import logging

from celery import shared_task
from django.db.models import F

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_check_low_stock_alerts(self, tenant_id: int):
    """Scan all products for low stock and fire low-stock notifications.

    Iterates every active, track_stock product for the tenant.
    For each product whose quantity_on_hand <= reorder_level:
      - Publishes 'inventory.stock.low' via EventBus
      - Sends an in-app + push + email notification to tenant admins

    Idempotent: safe to retry.  Called by Celery Beat daily.
    """
    try:
        from tenants.models import Tenant
        from .models import Product, StockLevel
        from core.events import EventBus
        from notifications.service import NotificationService
        from accounts.models import TenantMembership

        tenant = Tenant.objects.get(id=tenant_id)

        # Products with stock tracking enabled that are at or below reorder level
        low = (
            StockLevel.objects
            .filter(
                tenant=tenant,
                product__is_deleted=False,
                product__is_service=False,
                product__track_stock=True,
                quantity_on_hand__lte=F('product__reorder_level'),
            )
            .select_related('product')
        )

        for stock_level in low.iterator(chunk_size=200):
            product = stock_level.product

            EventBus.publish(
                'inventory.stock.low',
                {
                    'id': product.id,
                    'tenant_id': tenant_id,
                    'name': product.name,
                    'sku': product.sku,
                    'quantity_on_hand': stock_level.quantity_on_hand,
                    'reorder_level': product.reorder_level,
                },
                tenant=tenant,
            )

        # Send a single summary notification to all admin users if any items are low
        low_count = low.count()
        if low_count > 0:
            admin_memberships = TenantMembership.objects.filter(
                tenant=tenant,
                is_active=True,
                role__name__in=['owner', 'admin'],
            ).select_related('user')

            for membership in admin_memberships.iterator(chunk_size=50):
                NotificationService.send(
                    tenant=tenant,
                    user=membership.user,
                    title='Low Stock Alert',
                    body=f'{low_count} product{"s" if low_count != 1 else ""} at or below reorder level.',
                    data={
                        'type': 'inventory',
                        'action': 'view',
                        'tab': 'low-stock',
                    },
                )

        logger.info('Low stock check complete for tenant %s: %d products flagged.', tenant_id, low_count)

    except Exception as exc:
        logger.exception('task_check_low_stock_alerts failed for tenant %s', tenant_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_generate_auto_reorder(self, tenant_id: int):
    """Auto-generate draft POs for low-stock products with preferred suppliers.

    Idempotent — skips products that already have an open draft PO for their
    preferred supplier.  Called by Celery Beat daily after the low-stock scan.
    """
    try:
        from tenants.models import Tenant
        from .services import auto_reorder

        tenant = Tenant.objects.get(id=tenant_id)
        result = auto_reorder(tenant=tenant, user=None)
        logger.info('Auto-reorder for tenant %s: %s', tenant_id, result)

    except Exception as exc:
        logger.exception('task_generate_auto_reorder failed for tenant %s', tenant_id)
        raise self.retry(exc=exc)


@shared_task
def task_dispatch_low_stock_checks():
    """Celery Beat entry point: dispatches per-tenant low-stock checks.

    Runs daily (07:00 UTC).  Queues one task_check_low_stock_alerts per active
    tenant so each tenant's scan is retried independently on failure.
    """
    from tenants.models import Tenant

    tenant_ids = list(
        Tenant.objects
        .filter(is_active=True, is_deleted=False)
        .values_list('id', flat=True)
    )
    for tid in tenant_ids:
        task_check_low_stock_alerts.delay(tid)

    logger.info('Dispatched low-stock checks for %d tenants.', len(tenant_ids))

