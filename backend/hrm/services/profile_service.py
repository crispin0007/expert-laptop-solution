"""
hrm/services/profile_service.py

Business logic for StaffProfile creation and updates.
"""
import logging

logger = logging.getLogger(__name__)


def get_or_create_profile(membership) -> object:
    """Return the StaffProfile for *membership*, creating it if it doesn't exist."""
    from hrm.models import StaffProfile

    profile, created = StaffProfile.objects.get_or_create(
        tenant=membership.tenant,
        membership=membership,
        defaults={},
    )
    if created:
        logger.info('StaffProfile auto-created for membership=%s', membership.pk)
    return profile


def update_profile(profile, data: dict) -> object:
    """Apply *data* fields to *profile* and save.

    Only updates the fields that are present in *data* — partial update safe.
    """
    allowed_fields = {
        'designation', 'blood_group', 'date_of_birth', 'gender',
        'address', 'emergency_contact_name', 'emergency_contact_phone',
        'bank_name', 'bank_account_number', 'notes',
    }
    updated_fields = []
    for field, value in data.items():
        if field in allowed_fields:
            setattr(profile, field, value)
            updated_fields.append(field)

    if updated_fields:
        profile.save(update_fields=updated_fields)
        logger.info('StaffProfile updated id=%s fields=%s', profile.pk, updated_fields)

    return profile
