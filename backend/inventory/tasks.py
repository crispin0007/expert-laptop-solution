"""Inventory Celery tasks."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_check_low_stock_alerts(self, tenant_id: int):
    """Scan all products for low stock and fire notifications.

    Phase 2 stub — will scan StockLevel against reorder_level for all
    products in the tenant and dispatch notifications for each breach.
    """
    # TODO Phase 2: implement full scan + EventBus.publish('inventory.stock.low', ...)
    pass


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_generate_auto_reorder(self, tenant_id: int):
    """Auto-generate draft POs for low-stock products with preferred suppliers.

    Phase 2 stub — will call inventory.services.auto_reorder() as a
    background task triggered by the Celery Beat schedule.
    """
    # TODO Phase 2: from inventory.services import auto_reorder; auto_reorder(tenant, user=None)
    pass
