"""
inventory/tests/test_views.py
============================
Tests for inventory API view behavior.
"""

import io

from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from accounts.tokens import TenantRefreshToken
from inventory.models import Product, Category


def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug, plan=None):
    from core.throttles import _sanitize_slug

    tenant = Tenant.objects.create(
        name=f'Tenant {slug}', slug=slug, plan=plan or _plan(), is_active=True,
    )
    cache.delete(f'tenant_slug_{_sanitize_slug(slug)}')
    return tenant


def _user(email, password='Pass1234!'):
    return User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password=password,
    )


def _member(user, tenant, role='staff'):
    return TenantMembership.objects.create(
        user=user, tenant=tenant, role=role, is_active=True,
    )


def _token(user, tenant):
    refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)
    return str(refresh.access_token)


def _authed_client(user, tenant):
    access = _token(user, tenant)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
    return client


@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class InventoryProductImportTests(TestCase):

    def setUp(self):
        self.tenant = _tenant('importtest')
        self.admin = _user('admin@importtest.com')
        _member(self.admin, self.tenant, role='admin')
        self.client = _authed_client(self.admin, self.tenant)
        self.url = '/api/v1/inventory/products/import-csv/'
        self.host = 'importtest.bms.local'

    def test_csv_import_creates_new_category_if_missing(self):
        csv_content = (
            'name,sku,unit_price,category\n'
            'Desk Lamp,LAMP-001,1200.00,Office Supplies\n'
        )
        file_obj = io.BytesIO(csv_content.encode('utf-8'))
        file_obj.name = 'products.csv'
        file_obj.seek(0)

        response = self.client.post(
            self.url,
            {'file': file_obj},
            format='multipart',
            HTTP_HOST=self.host,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['created'], 1)
        self.assertEqual(response.data['updated'], 0)
        self.assertEqual(response.data['errors'], 0)
        self.assertTrue(Category.objects.filter(tenant=self.tenant, name='Office Supplies').exists())
        self.assertTrue(Product.objects.filter(tenant=self.tenant, sku='LAMP-001', category__name='Office Supplies').exists())

    def test_csv_import_creates_category_hierarchy_from_path(self):
        csv_content = (
            'name,sku,unit_price,category\n'
            'Laser Printer,PRINTER-01,25000.00,Office Equipment > Printers\n'
        )
        file_obj = io.BytesIO(csv_content.encode('utf-8'))
        file_obj.name = 'products.csv'
        file_obj.seek(0)

        response = self.client.post(
            self.url,
            {'file': file_obj},
            format='multipart',
            HTTP_HOST=self.host,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['created'], 1)
        self.assertEqual(response.data['updated'], 0)
        self.assertEqual(response.data['errors'], 0)

        parent = Category.objects.get(tenant=self.tenant, name='Office Equipment')
        child = Category.objects.get(tenant=self.tenant, name='Printers')
        self.assertEqual(child.parent_id, parent.id)
        self.assertTrue(Product.objects.filter(tenant=self.tenant, sku='PRINTER-01', category=child).exists())
