"""
Migration 0007 — Seed modules + plans, migrate Tenant.plan CharField → FK

Seed data:
  Modules (6):  tickets, customers, departments, projects, inventory, accounting
  Plans   (3):  Free (tickets+customers+departments)
                Basic (Free + projects + accounting)
                Pro (all modules)
  Tenants:      old plan_str ('free'/'basic'/'pro') → matching Plan FK
                any unrecognised value → Free plan
After seeding, the legacy plan_str CharField is removed.
"""
from django.db import migrations


# ── Module definitions ────────────────────────────────────────────────────────
MODULES = [
    {
        'key': 'tickets',
        'name': 'Ticket System',
        'description': 'Customer support tickets, SLA management, assignments and transfers.',
        'icon': 'Ticket',
        'is_core': False,
        'order': 10,
    },
    {
        'key': 'customers',
        'name': 'Customer Management',
        'description': 'Customer profiles, contacts, and interaction history.',
        'icon': 'Users',
        'is_core': False,
        'order': 20,
    },
    {
        'key': 'departments',
        'name': 'Departments',
        'description': 'Organise staff into departments and teams.',
        'icon': 'Building2',
        'is_core': True,  # core — always active; used internally for staff structure
        'order': 30,
    },
    {
        'key': 'projects',
        'name': 'Project Management',
        'description': 'Projects, tasks, milestones and project-based invoicing.',
        'icon': 'FolderKanban',
        'is_core': False,
        'order': 40,
    },
    {
        'key': 'inventory',
        'name': 'Inventory',
        'description': 'Products, stock tracking and movements.',
        'icon': 'Package',
        'is_core': False,
        'order': 50,
    },
    {
        'key': 'accounting',
        'name': 'Accounting',
        'description': 'Invoices, ledger, coin payslips and financial reporting.',
        'icon': 'Receipt',
        'is_core': False,
        'order': 60,
    },
]

# ── Plan definitions: slug → list of module keys included ────────────────────
PLANS = [
    {
        'name': 'Free',
        'slug': 'free',
        'description': 'Entry-level plan with core helpdesk features.',
        'modules': ['tickets', 'customers', 'departments'],
    },
    {
        'name': 'Basic',
        'slug': 'basic',
        'description': 'Standard business plan with project management and accounting.',
        'modules': ['tickets', 'customers', 'departments', 'projects', 'accounting'],
    },
    {
        'name': 'Pro',
        'slug': 'pro',
        'description': 'Full-featured plan including inventory management.',
        'modules': ['tickets', 'customers', 'departments', 'projects', 'inventory', 'accounting'],
    },
]


def seed_forward(apps, schema_editor):
    Module = apps.get_model('tenants', 'Module')
    Plan   = apps.get_model('tenants', 'Plan')
    Tenant = apps.get_model('tenants', 'Tenant')

    # 1. Create modules
    module_map = {}
    for m in MODULES:
        obj, _ = Module.objects.get_or_create(key=m['key'], defaults=m)
        module_map[m['key']] = obj

    # 2. Create plans and assign modules
    plan_map = {}
    for p in PLANS:
        plan_obj, _ = Plan.objects.get_or_create(
            slug=p['slug'],
            defaults={'name': p['name'], 'description': p['description'], 'is_active': True},
        )
        plan_obj.modules.set([module_map[k] for k in p['modules']])
        plan_map[p['slug']] = plan_obj

    # 3. Map each tenant's plan_str to the FK
    default_plan = plan_map['free']
    for tenant in Tenant.objects.all():
        old_str = (tenant.plan_str or '').strip().lower()
        tenant.plan = plan_map.get(old_str, default_plan)
        tenant.save(update_fields=['plan'])


def seed_reverse(apps, schema_editor):
    """Restore plan_str from FK name (best-effort)."""
    Tenant = apps.get_model('tenants', 'Tenant')
    for tenant in Tenant.objects.select_related('plan').all():
        if tenant.plan:
            tenant.plan_str = tenant.plan.slug
        else:
            tenant.plan_str = 'free'
        tenant.save(update_fields=['plan_str'])


class Migration(migrations.Migration):
    # Required because RunPython fires tenant signals that leave pending trigger events;
    # without atomic=False the subsequent RemoveField ALTER TABLE would fail in PostgreSQL.
    atomic = False

    dependencies = [
        ('tenants', '0006_module_plan_subscription'),
    ]

    operations = [
        # 1. Seed data
        migrations.RunPython(seed_forward, reverse_code=seed_reverse),

        # 2. Remove the legacy string field now that FK is populated
        migrations.RemoveField(
            model_name='tenant',
            name='plan_str',
        ),
    ]
