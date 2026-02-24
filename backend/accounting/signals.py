"""
Accounting signals.

Coin workflow (per business rules):
- Ticket closed → coins are NOT auto-created. The admin/manager manually awards
  coins via the POST /tickets/{id}/close/ action, which creates an already-approved
  CoinTransaction with the amount they specify.
- Ticket cancelled → any pending CoinTransactions for that ticket are rejected.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='tickets.Ticket')
def handle_ticket_cancelled(sender, instance, created, **kwargs):
    """
    When a ticket is cancelled, reject any still-pending coin transactions
    that were previously created for it (e.g. from tasks or manual awards that
    haven't been finalised yet).
    """
    if created:
        return

    from tickets.models import Ticket
    from accounting.models import CoinTransaction

    if instance.status == Ticket.STATUS_CANCELLED:
        CoinTransaction.objects.filter(
            tenant=instance.tenant,
            source_type=CoinTransaction.SOURCE_TICKET,
            source_id=instance.pk,
            status=CoinTransaction.STATUS_PENDING,
        ).update(status=CoinTransaction.STATUS_REJECTED)


@receiver(post_save, sender='projects.ProjectTask')
def handle_task_done(sender, instance, created, **kwargs):
    """On task done, award pending coins to assigned staff."""
    if created or not instance.assigned_to_id:
        return

    from accounting.models import CoinTransaction

    if instance.status == 'done':
        already_exists = CoinTransaction.objects.filter(
            tenant=instance.tenant,
            source_type=CoinTransaction.SOURCE_TASK,
            source_id=instance.pk,
        ).exists()
        if not already_exists:
            CoinTransaction.objects.create(
                tenant=instance.tenant,
                created_by=instance.assigned_to,
                staff=instance.assigned_to,
                amount=1,
                source_type=CoinTransaction.SOURCE_TASK,
                source_id=instance.pk,
                status=CoinTransaction.STATUS_PENDING,
            )
