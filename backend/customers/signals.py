from django.db.models.signals import post_save
from django.dispatch import receiver

from customers.models import Customer
from parties.services import resolve_or_create_customer_party


@receiver(post_save, sender=Customer)
def ensure_customer_party_on_save(sender, instance: Customer, created: bool, **kwargs) -> None:
    """Ensure every customer has a linked Party and sub-ledger account."""
    if getattr(instance, 'is_deleted', False):
        return

    if instance.party_id:
        return

    # Best-effort sync; never block customer persistence if linkage fails.
    try:
        resolve_or_create_customer_party(instance, dry_run=False)
    except Exception:
        return
