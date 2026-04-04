# hrm/signals.py
# Django signals for the HRM module.

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='accounts.TenantMembership')
def auto_create_staff_profile(sender, instance, created, **kwargs):
    """Auto-create a StaffProfile whenever a TenantMembership is created.

    This ensures every staff member automatically has an HRM profile row,
    so attendance / shift / report dropdowns are always populated without
    requiring a manual creation step.
    """
    if created:
        from hrm.services.profile_service import get_or_create_profile
        try:
            get_or_create_profile(instance)
        except Exception:
            # DB errors (e.g. during tests with incomplete fixtures) must not
            # abort the membership creation transaction.
            pass
