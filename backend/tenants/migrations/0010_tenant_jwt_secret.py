"""
Migration 0010 — Add jwt_signing_secret to Tenant model.

Each tenant gets its own HMAC secret that is embedded as a ``tenant_sig``
claim in every JWT issued for that tenant.  Rotating the secret instantly
invalidates all outstanding tokens for the tenant without touching the global
DJANGO_SECRET_KEY.

Existing tenants: the secret is populated by a data migration (RunPython) so
that all rows get a secret immediately. New tenants: the Tenant.save() override
auto-generates the secret on first save.
"""

import secrets

from django.db import migrations, models


def _generate_secrets(apps, schema_editor):
    """Back-fill jwt_signing_secret for all existing tenants."""
    Tenant = apps.get_model('tenants', 'Tenant')
    bulk = []
    for tenant in Tenant.objects.filter(jwt_signing_secret=''):
        tenant.jwt_signing_secret = secrets.token_hex(32)
        bulk.append(tenant)
    if bulk:
        Tenant.objects.bulk_update(bulk, ['jwt_signing_secret'])


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0009_slugreservation'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='jwt_signing_secret',
            field=models.CharField(
                max_length=64,
                blank=True,
                default='',
                help_text=(
                    'Per-tenant HMAC secret for JWT binding. '
                    'Auto-generated on first save. Rotate to invalidate all tenant tokens.'
                ),
            ),
        ),
        # Immediately back-fill all existing tenants
        migrations.RunPython(_generate_secrets, migrations.RunPython.noop),
    ]
