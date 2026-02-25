"""
Management command: seed_demo_tenants
=======================================
Creates 3 demo tenants (free / basic / pro) with admin users
and verifies the module-gating API response.

Usage:
    python manage.py seed_demo_tenants

Safe to re-run — uses get_or_create everywhere, nothing is duplicated.

Tenant layout
-------------
  Slug   Plan   Admin email           Modules included
  -----  -----  --------------------  -----------------------------------------------
  free   Free   admin@free.nexus      core only  (staff, settings)
  basic  Basic  admin@basic.nexus     tickets, projects, accounting, customers, depts
  pro    Pro    admin@pro.nexus       all modules
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

ADMIN_PASSWORD = 'Admin@123'

PLAN_CONFIGS = [
    {
        'slug': 'free',
        'name': 'Free',
        'description': 'Core features only — staff management and settings.',
        'modules': [],  # only core modules (always active)
    },
    {
        'slug': 'basic',
        'name': 'Basic',
        'description': 'Tickets, Projects, Accounting, Customers, Departments.',
        'modules': ['tickets', 'projects', 'accounting', 'customers', 'departments'],
    },
    {
        'slug': 'pro',
        'name': 'Pro',
        'description': 'All modules including Inventory and full feature set.',
        'modules': ['tickets', 'projects', 'accounting', 'customers', 'departments', 'inventory'],
    },
]

TENANT_CONFIGS = [
    {
        'slug': 'free',
        'name': 'Free Demo Co',
        'plan_slug': 'free',
        'admin_email': 'admin@free.nexus',
    },
    {
        'slug': 'basic',
        'name': 'Basic Demo Co',
        'plan_slug': 'basic',
        'admin_email': 'admin@basic.nexus',
    },
    {
        'slug': 'pro',
        'name': 'Pro Demo Co',
        'plan_slug': 'pro',
        'admin_email': 'admin@pro.nexus',
    },
]


class Command(BaseCommand):
    help = 'Seed 3 demo tenants (free/basic/pro) with admin users and verify module API.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--verify-only',
            action='store_true',
            help='Skip creation — only print the current module state for each tenant.',
        )

    # ── helpers ──────────────────────────────────────────────────────────────

    def ok(self, msg):
        self.stdout.write(self.style.SUCCESS(f'  ✓ {msg}'))

    def skip(self, msg):
        self.stdout.write(self.style.WARNING(f'  ~ {msg}'))

    def info(self, msg):
        self.stdout.write(f'    {msg}')

    def section(self, title):
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(f'── {title} ──'))

    # ── main ─────────────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        from tenants.models import Plan, Module, Tenant
        from accounts.models import TenantMembership

        verify_only = options['verify_only']

        if not verify_only:
            self._seed_plans()
            self._seed_tenants()

        self._verify_modules()

    # ── step 1: plans ─────────────────────────────────────────────────────────

    def _seed_plans(self):
        from tenants.models import Plan, Module

        self.section('Plans')

        for cfg in PLAN_CONFIGS:
            plan, created = Plan.objects.get_or_create(
                slug=cfg['slug'],
                defaults={
                    'name': cfg['name'],
                    'description': cfg['description'],
                    'is_active': True,
                },
            )
            if created:
                self.ok(f'Plan "{plan.name}" created')
            else:
                self.skip(f'Plan "{plan.name}" already exists')

            # Sync modules — get the Module objects for the listed keys
            module_qs = Module.objects.filter(key__in=cfg['modules'])
            found_keys = set(module_qs.values_list('key', flat=True))
            missing = set(cfg['modules']) - found_keys
            if missing:
                self.stdout.write(self.style.WARNING(
                    f'    ⚠ Module keys not found in DB for plan "{plan.name}": {missing}\n'
                    f'      Run migrations first — modules are seeded via data migration.'
                ))

            plan.modules.set(module_qs)
            self.info(f'Modules set: {sorted(found_keys) or ["(none — core only)"]!r}')

    # ── step 2: tenants + users ───────────────────────────────────────────────

    def _seed_tenants(self):
        from tenants.models import Plan, Tenant
        from accounts.models import TenantMembership

        self.section('Tenants & Admin Users')

        for cfg in TENANT_CONFIGS:
            plan = Plan.objects.filter(slug=cfg['plan_slug']).first()
            if not plan:
                self.stdout.write(self.style.ERROR(
                    f'  ✗ Plan "{cfg["plan_slug"]}" not found — run without --verify-only first.'
                ))
                continue

            # --- User ---
            email = cfg['admin_email']
            username = email.replace('@', '_').replace('.', '_')
            user, u_created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': username,
                    'full_name': f'Admin ({cfg["slug"].title()})',
                    'is_staff': False,
                    'is_superuser': False,
                    'is_superadmin': False,
                },
            )
            if u_created:
                user.set_password(ADMIN_PASSWORD)
                user.save()
                self.ok(f'User {email} created (password: {ADMIN_PASSWORD})')
            else:
                self.skip(f'User {email} already exists')

            # --- Tenant ---
            tenant, t_created = Tenant.objects.get_or_create(
                slug=cfg['slug'],
                defaults={
                    'name': cfg['name'],
                    'plan': plan,
                    'is_active': True,
                    'is_deleted': False,
                    'created_by': user,
                },
            )
            if t_created:
                self.ok(f'Tenant "{tenant.name}" ({cfg["slug"]}) created on plan "{plan.name}"')
            else:
                # Update plan if it differs
                if tenant.plan_id != plan.pk:
                    tenant.plan = plan
                    tenant.save(update_fields=['plan'])
                    self.ok(f'Tenant "{tenant.name}" plan updated → "{plan.name}"')
                else:
                    self.skip(f'Tenant "{cfg["slug"]}" already exists on plan "{plan.name}"')

            # --- Membership ---
            membership, m_created = TenantMembership.objects.get_or_create(
                user=user,
                tenant=tenant,
                defaults={
                    'role': 'owner',
                    'is_admin': True,
                    'is_active': True,
                },
            )
            if m_created:
                self.ok(f'Membership created: {email} → owner of "{cfg["slug"]}"')
            else:
                if not membership.is_admin or membership.role != 'owner':
                    membership.is_admin = True
                    membership.role = 'owner'
                    membership.save(update_fields=['is_admin', 'role'])
                    self.ok(f'Membership updated to owner for {email}')
                else:
                    self.skip(f'Membership {email} → "{cfg["slug"]}" already correct')

    # ── step 3: verify ────────────────────────────────────────────────────────

    def _verify_modules(self):
        from tenants.models import Tenant

        self.section('Module Verification (simulating /accounts/me/ + active_modules)')

        tenants = Tenant.objects.filter(
            slug__in=[c['slug'] for c in TENANT_CONFIGS]
        ).select_related('plan').prefetch_related('plan__modules', 'module_overrides__module')

        all_ok = True
        rows = []

        for tenant in tenants:
            active = sorted(tenant.active_modules_set)
            plan_name = tenant.plan.name if tenant.plan else '(no plan)'
            admin_email = next(
                (c['admin_email'] for c in TENANT_CONFIGS if c['slug'] == tenant.slug), '—'
            )
            rows.append((tenant.slug, plan_name, admin_email, active))

        # Print table
        self.stdout.write('')
        header = f'  {"SLUG":<10} {"PLAN":<10} {"ADMIN EMAIL":<25} {"ACTIVE MODULES"}'
        self.stdout.write(header)
        self.stdout.write('  ' + '-' * (len(header) - 2))
        for slug, plan_name, email, mods in rows:
            mods_str = ', '.join(mods) if mods else '(none)'
            self.stdout.write(f'  {slug:<10} {plan_name:<10} {email:<25} {mods_str}')

        # Cross-check expected modules are present
        self.stdout.write('')
        expected = {c['slug']: c['plan_slug'] for c in TENANT_CONFIGS}
        plan_mods = {c['slug']: set(c['modules']) for c in PLAN_CONFIGS}

        for slug, plan_name, email, active_mods in rows:
            expected_plan = expected.get(slug)
            if not expected_plan:
                continue
            expected_mods = plan_mods.get(expected_plan, set())
            active_set = set(active_mods)
            # Core modules are always present — remove them from expectations gap check
            from tenants.models import Module
            core_keys = set(Module.objects.filter(is_core=True).values_list('key', flat=True))
            missing_mods = expected_mods - active_set

            if missing_mods:
                self.stdout.write(self.style.ERROR(
                    f'  ✗ [{slug}] Missing expected modules: {sorted(missing_mods)}'
                ))
                all_ok = False
            else:
                self.ok(f'[{slug}] Active modules match plan "{plan_name}" ✓')
                # Confirm core modules are present
                missing_core = core_keys - active_set
                if missing_core:
                    self.stdout.write(self.style.WARNING(
                        f'    ⚠ Core modules missing: {sorted(missing_core)}'
                    ))

        self.stdout.write('')
        if all_ok:
            self.stdout.write(self.style.SUCCESS('All tenants verified — module gating is working correctly.'))
        else:
            self.stdout.write(self.style.ERROR(
                'Some module mismatches found. Make sure module keys exist in the DB.\n'
                'Run: python manage.py migrate  (modules are seeded in a data migration)'
            ))

        self.stdout.write('')
        self.stdout.write('── Login credentials ──')
        for cfg in TENANT_CONFIGS:
            self.stdout.write(
                f'  {cfg["slug"]:<8}  {cfg["admin_email"]:<25}  password: {ADMIN_PASSWORD}'
                f'   → access via http://{cfg["slug"]}.localhost:5173'
            )
        self.stdout.write('')
