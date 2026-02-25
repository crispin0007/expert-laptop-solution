"""
One-shot fix command: clears stale lol overrides and fixes demo admin flag.
python manage.py fix_tenant_overrides
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Fix stale module overrides on lol and is_admin flag on demo'

    def handle(self, *args, **options):
        from tenants.models import Tenant, TenantModuleOverride
        from accounts.models import TenantMembership

        # ── lol: wipe overrides left by old buggy toggle_module UI ──
        try:
            lol = Tenant.objects.get(slug='lol')
            deleted, _ = TenantModuleOverride.objects.filter(tenant=lol).delete()
            self.stdout.write(self.style.SUCCESS(
                f'lol: deleted {deleted} stale override(s)'
            ))
            self.stdout.write(f'lol active_modules now: {sorted(lol.active_modules_set)}')
        except Tenant.DoesNotExist:
            self.stdout.write(self.style.WARNING('lol tenant not found — skipping'))

        # ── demo: ensure admin@demo.com has is_admin=True ──
        try:
            demo = Tenant.objects.get(slug='demo')
            mem = TenantMembership.objects.filter(
                tenant=demo, user__email='admin@demo.com'
            ).select_related('user').first()

            if mem and not mem.is_admin:
                mem.is_admin = True
                mem.save(update_fields=['is_admin'])
                self.stdout.write(self.style.SUCCESS(
                    'demo: admin@demo.com is_admin → True'
                ))
            elif mem:
                self.stdout.write('demo: admin@demo.com is_admin already True')
            else:
                self.stdout.write(self.style.WARNING(
                    'demo: admin@demo.com membership not found'
                ))
            self.stdout.write(f'demo active_modules: {sorted(demo.active_modules_set)}')
        except Tenant.DoesNotExist:
            self.stdout.write(self.style.WARNING('demo tenant not found — skipping'))

        self.stdout.write(self.style.SUCCESS('\nDone.'))
