"""
Migration 0013 — Seed the CMS/Website Builder module.

Adds:
  Module  key='cms'  (Website / CMS)
  Plan assignment: Pro plan — cms is included by default.
                   Starter/Basic plans can enable it via TenantModuleOverride.

Reversible: removes the Module record on rollback.
"""
from django.db import migrations

CMS_MODULE = {
    'key': 'cms',
    'name': 'Website / CMS',
    'description': 'AI-powered website builder with page editor, blog, custom domain and product catalogue.',
    'icon': 'Globe',
    'is_core': False,
    'order': 70,
}

# Plans that should include CMS by default
CMS_PLANS = ['pro']


def seed_forward(apps, schema_editor):
    Module = apps.get_model('tenants', 'Module')
    Plan   = apps.get_model('tenants', 'Plan')

    # Create (or update) the cms Module record
    obj, created = Module.objects.update_or_create(
        key=CMS_MODULE['key'],
        defaults={k: v for k, v in CMS_MODULE.items() if k != 'key'},
    )

    # Add to the configured plans
    for slug in CMS_PLANS:
        try:
            plan = Plan.objects.get(slug=slug)
            plan.modules.add(obj)
        except Plan.DoesNotExist:
            pass  # plan not seeded yet — silently skip


def seed_reverse(apps, schema_editor):
    Module = apps.get_model('tenants', 'Module')
    Module.objects.filter(key='cms').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0012_tenant_primary_color_tenant_sla_warn_before_minutes_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_forward, seed_reverse),
    ]
