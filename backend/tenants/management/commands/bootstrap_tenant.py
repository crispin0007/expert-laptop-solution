"""
Management command to bootstrap a tenant and link an admin user to it.

Usage:
  python manage.py bootstrap_tenant \
    --slug els \
    --name "Expert Laptop Solution" \
    --admin-email admin@example.com

This is safe to run multiple times — it won't duplicate the tenant or membership.
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create a tenant and link an existing superuser as its owner/admin.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--slug',
            required=True,
            help='Tenant slug — short identifier, e.g. "els" or "acme"',
        )
        parser.add_argument(
            '--name',
            required=True,
            help='Display name of the tenant, e.g. "Expert Laptop Solution"',
        )
        parser.add_argument(
            '--admin-email',
            required=True,
            dest='admin_email',
            help='Email of the superuser to link as tenant admin',
        )

    def handle(self, *args, **options):
        from tenants.models import Tenant
        from accounts.models import TenantMembership

        slug = options['slug'].lower().strip()
        name = options['name'].strip()
        admin_email = options['admin_email'].strip()

        # --- 1. Get the admin user ---
        try:
            user = User.objects.get(email=admin_email)
        except User.DoesNotExist:
            raise CommandError(
                f'No user found with email "{admin_email}". '
                f'Run "python manage.py createsuperuser" first.'
            )

        # --- 2. Create or retrieve tenant ---
        tenant, tenant_created = Tenant.objects.get_or_create(
            slug=slug,
            defaults={
                'name': name,
                'plan': 'pro',
                'is_active': True,
                'is_deleted': False,
                'created_by': user,
            },
        )
        if tenant_created:
            self.stdout.write(self.style.SUCCESS(f'✓ Tenant "{name}" ({slug}) created.'))
        else:
            self.stdout.write(self.style.WARNING(f'  Tenant "{slug}" already exists — skipping creation.'))

        # --- 3. Create or retrieve membership (owner role) ---
        membership, mem_created = TenantMembership.objects.get_or_create(
            user=user,
            tenant=tenant,
            defaults={
                'role': 'owner',
                'is_admin': True,
                'is_active': True,
            },
        )
        if mem_created:
            self.stdout.write(self.style.SUCCESS(f'✓ User "{admin_email}" linked to tenant as owner.'))
        else:
            # Ensure admin flag is set even if membership already existed
            if not membership.is_admin:
                membership.is_admin = True
                membership.role = 'owner'
                membership.save()
            self.stdout.write(self.style.WARNING(f'  Membership already exists — ensured is_admin=True.'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Bootstrap complete!'))
        self.stdout.write(f'  Tenant slug : {slug}')
        self.stdout.write(f'  Tenant name : {tenant.name}')
        self.stdout.write(f'  Admin user  : {admin_email}')
        self.stdout.write('')
        self.stdout.write('Now log in to the app — your tenant will load automatically.')
