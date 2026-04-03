"""
Migration 0018 — Seed the HRM module and add it to the Pro plan.

Adds:
  Module  key='hrm'  (HR Management)
  Plan assignment: Pro plan only — hrm is a Pro feature.
                   Free/Basic tenants can be granted it via TenantModuleOverride.

Reversible: removes the Module record on rollback (also removes M2M rows via cascade).
"""
from django.db import migrations

HRM_MODULE = {
    'key': 'hrm',
    'name': 'HR Management',
    'description': 'Staff profiles, leave management, attendance tracking and performance reviews.',
    'icon': 'Users',
    'is_core': False,
    'order': 65,
}

# Plans that include HRM by default
HRM_PLANS = ['pro']


def seed_forward(apps, schema_editor):
    Module = apps.get_model('tenants', 'Module')
    Plan   = apps.get_model('tenants', 'Plan')

    obj, _ = Module.objects.update_or_create(
        key=HRM_MODULE['key'],
        defaults={k: v for k, v in HRM_MODULE.items() if k != 'key'},
    )

    for slug in HRM_PLANS:
        try:
            plan = Plan.objects.get(slug=slug)
            plan.modules.add(obj)
        except Plan.DoesNotExist:
            pass  # plan not seeded yet — silently skip


def seed_reverse(apps, schema_editor):
    Module = apps.get_model('tenants', 'Module')
    Module.objects.filter(key='hrm').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0017_tenant_add_pan_vat_reg'),
    ]

    operations = [
        migrations.RunPython(seed_forward, seed_reverse),
    ]
