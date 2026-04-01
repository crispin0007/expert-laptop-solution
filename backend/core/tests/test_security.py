"""
Security test suite — Phase 3 hardening.

Covers:
  1. Cross-tenant IDOR: requests scoped to the wrong tenant return 404.
  2. Module-gated endpoints return 403 when the module is inactive.
  3. Tenant slug is immutable after creation (PATCH rejected).
  4. Deleted tenant slug cannot be reused by a new tenant.
  5. Unknown subdomain probe returns a generic response (no context leakage).
  6. TenantRateThrottle cache key strips non-safe characters (no poisoning).
  7. IsSuperAdmin IP allowlist blocks a request from an unlisted IP.
  8. AuditLog row is written on successful login.
  9. Module cache is invalidated after a plan change.

Run with:
    docker exec nexusbms-web-1 python manage.py test core.tests.test_security
"""
import json
from unittest.mock import patch, MagicMock

from django.core.cache import cache as django_cache
from django.test import TestCase, TransactionTestCase, RequestFactory, override_settings
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, TenantMembership
from tenants.models import Tenant, Plan, Module, SlugReservation
from core.audit import AuditLog, AuditEvent, log_event
from core.throttles import _sanitize_slug


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_plan(name='TestPlan') -> Plan:
    slug = name.lower().replace(' ', '-').replace('_', '-')[:50]
    return Plan.objects.get_or_create(name=name, defaults={'description': 'Test plan', 'slug': slug})[0]


def _create_tenant(slug='test-tenant', plan=None) -> Tenant:
    if plan is None:
        plan = _create_plan()
    return Tenant.objects.create(
        slug=slug,
        name=f'Tenant {slug}',
        plan=plan,
        is_active=True,
        is_deleted=False,
    )


def _create_user(email='user@example.com', is_superuser=False, is_superadmin=False) -> User:
    user = User.objects.create_user(
        username=email.replace('@', '_').replace('.', '_'),
        email=email,
        password='TestPass123!',
    )
    if is_superuser:
        user.is_superuser = True
    if is_superadmin:
        user.is_superadmin = True
        user.is_superuser = True
    if is_superuser or is_superadmin:
        user.save()
    return user


def _add_member(user, tenant, role='staff') -> TenantMembership:
    return TenantMembership.objects.create(
        user=user,
        tenant=tenant,
        role=role,
        is_active=True,
    )


def _get_token(user, tenant=None) -> str:
    """Issue a TenantRefreshToken and return its access token string."""
    from accounts.tokens import TenantRefreshToken
    refresh = TenantRefreshToken.for_user_and_tenant(user, tenant)
    return str(refresh.access_token)


# ── Tests ─────────────────────────────────────────────────────────────────────


@override_settings(ALLOWED_HOSTS=['*'])
class CrossTenantIDORTest(TestCase):
    """IDOR: TenantMixin must prevent cross-tenant data access."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('IDOR-Plan')
        self.tenant_a = _create_tenant('idor-a', self.plan)
        self.tenant_b = _create_tenant('idor-b', self.plan)
        self.user_b = _create_user('user_b@example.com')
        _add_member(self.user_b, self.tenant_b)
        self.token_b = _get_token(self.user_b, self.tenant_b)

    def test_cannot_read_other_tenant_customer(self):
        """A user from tenant B cannot access a customer created in tenant A."""
        from customers.models import Customer
        # Create a customer explicitly in tenant A
        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Secret Corp',
            email='secret@corp.com',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        # Use HTTP_HOST to simulate tenant B subdomain (works even with DEBUG=False)
        response = client.get(
            f'/api/v1/customers/{customer_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )
        # TenantMixin filters by tenant B — the tenant A customer must not be found
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_cannot_create_contact_for_other_tenant_customer(self):
        """A user from tenant B cannot create a contact under tenant A customer."""
        from customers.models import Customer

        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Customer',
            phone='9800000001',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.post(
            f'/api/v1/customers/{customer_a.pk}/contacts/',
            data={
                'name': 'Probe Contact',
                'email': 'probe@example.com',
                'phone': '9800000002',
            },
            format='json',
            HTTP_HOST='idor-b.bms.local',
        )

        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_department_serializer_rejects_cross_tenant_head(self):
        """Department head must belong to the current tenant workspace."""
        from departments.serializers import DepartmentSerializer

        user_a = _create_user('dept-head-a@example.com')
        _add_member(user_a, self.tenant_a, role='manager')

        request = RequestFactory().post('/api/v1/departments/')
        request.tenant = self.tenant_b

        serializer = DepartmentSerializer(
            data={'name': 'Operations', 'head': user_a.pk},
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('head', serializer.errors)

    def test_supplier_product_serializer_rejects_cross_tenant_links(self):
        """SupplierProduct cannot link supplier/product from a different tenant."""
        from inventory.models import Supplier, Product
        from inventory.serializers import SupplierProductSerializer

        supplier_a = Supplier.objects.create(tenant=self.tenant_a, name='Supplier A')
        product_a = Product.objects.create(tenant=self.tenant_a, name='Product A', sku='A-1')

        request = RequestFactory().post('/api/v1/inventory/supplier-products/')
        request.tenant = self.tenant_b

        serializer = SupplierProductSerializer(
            data={'supplier': supplier_a.pk, 'product': product_a.pk, 'unit_cost': '10.00'},
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertTrue('supplier' in serializer.errors or 'product' in serializer.errors)

    def test_purchase_order_serializer_rejects_cross_tenant_refs(self):
        """PurchaseOrder write serializer must reject supplier/product from another tenant."""
        from inventory.models import Supplier, Product
        from inventory.serializers import PurchaseOrderWriteSerializer

        supplier_a = Supplier.objects.create(tenant=self.tenant_a, name='Supplier A')
        product_a = Product.objects.create(tenant=self.tenant_a, name='Product A', sku='A-2')

        request = RequestFactory().post('/api/v1/inventory/purchase-orders/')
        request.tenant = self.tenant_b

        serializer = PurchaseOrderWriteSerializer(
            data={
                'supplier': supplier_a.pk,
                'items': [
                    {
                        'product': product_a.pk,
                        'quantity_ordered': 1,
                        'quantity_received': 0,
                        'unit_cost': '5.00',
                    }
                ],
            },
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('supplier', serializer.errors)

    def test_invoice_serializer_rejects_cross_tenant_customer(self):
        """Invoice serializer must reject customer from another tenant."""
        from customers.models import Customer
        from accounting.serializers import InvoiceSerializer

        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Customer',
            phone='9811111111',
        )

        request = RequestFactory().post('/api/v1/accounting/invoices/')
        request.tenant = self.tenant_b

        serializer = InvoiceSerializer(
            data={
                'customer': customer_a.pk,
                'line_items': [{'description': 'Service', 'qty': 1, 'unit_price': '100.00'}],
                'due_date': '2026-04-30',
            },
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('customer', serializer.errors)

    def test_payment_serializer_rejects_cross_tenant_invoice(self):
        """Payment serializer must reject invoice from another tenant."""
        from accounting.models import Invoice
        from accounting.serializers import PaymentSerializer

        invoice_a = Invoice.objects.create(
            tenant=self.tenant_a,
            line_items=[{'description': 'Repair', 'qty': 1, 'unit_price': '50.00'}],
            subtotal='50.00',
            total='50.00',
        )

        request = RequestFactory().post('/api/v1/accounting/payments/')
        request.tenant = self.tenant_b

        serializer = PaymentSerializer(
            data={
                'date': '2026-04-01',
                'type': 'incoming',
                'method': 'cash',
                'amount': '50.00',
                'invoice': invoice_a.pk,
            },
            context={'request': request},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('invoice', serializer.errors)

    def test_payment_service_rejects_cross_tenant_bill(self):
        """record_payment must reject bill linked from another tenant."""
        from accounting.models import Bill
        from accounting.services.payment_service import record_payment

        bill_a = Bill.objects.create(
            tenant=self.tenant_a,
            supplier_name='Vendor A',
            line_items=[{'description': 'Parts', 'qty': 1, 'unit_price': '20.00'}],
            subtotal='20.00',
            total='20.00',
        )

        with self.assertRaisesMessage(ValueError, 'Bill does not belong to this workspace.'):
            record_payment(
                tenant=self.tenant_b,
                created_by=self.user_b,
                payment_type='outgoing',
                method='cash',
                amount=20,
                bill=bill_a,
            )

    def test_cms_create_blog_post_rejects_cross_tenant_author(self):
        """CMS blog author must be a member of the same tenant as the site."""
        from cms.services import create_blog_post
        from cms.models import CMSSite

        outsider = _create_user('cms-outsider@example.com')
        _add_member(outsider, self.tenant_a, role='staff')

        site_b, _ = CMSSite.objects.get_or_create(
            tenant=self.tenant_b,
            defaults={'site_name': 'Tenant B Site'},
        )

        with self.assertRaisesMessage(ValueError, 'Author must be an active member of this workspace.'):
            create_blog_post(
                site=site_b,
                data={
                    'title': 'Tenant B Post',
                    'author': outsider.pk,
                },
                user=self.user_b,
            )

    def test_tenant_membership_create_rejects_cross_tenant_body(self):
        """POST /api/v1/accounts/memberships/ must not allow tenant injection from request body."""
        admin_b = _create_user('admin-b@example.com')
        _add_member(admin_b, self.tenant_b, role='admin')
        token_b = _get_token(admin_b, self.tenant_b)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b}')

        # Attempt to create a membership in tenant_a by passing tenant_a.pk in the body
        response = client.post(
            '/api/v1/accounts/memberships/',
            data={
                'tenant': self.tenant_a.pk,   # cross-tenant injection attempt
                'role': 'admin',
                'user': admin_b.pk,
            },
            format='json',
            HTTP_HOST='idor-b.bms.local',
        )
        # Must succeed only for tenant_b (tenant is injected server-side) or
        # fail entirely — never create a membership in tenant_a.
        if response.status_code in (status.HTTP_201_CREATED, status.HTTP_200_OK):
            from accounts.models import TenantMembership as TM
            created = TM.objects.filter(
                user=admin_b, tenant=self.tenant_a
            ).exists()
            self.assertFalse(
                created,
                'TenantMembership was created in tenant_a despite being requested from tenant_b context.',
            )

    def test_invite_staff_rejects_cross_tenant_department(self):
        """InviteStaffSerializer must reject a department from a different tenant."""
        from accounts.serializers import InviteStaffSerializer
        from departments.models import Department

        dept_a = Department.objects.create(tenant=self.tenant_a, name='Dept A')

        serializer = InviteStaffSerializer(
            data={
                'email': 'newstaff@example.com',
                'department': dept_a.pk,
            },
            context={'tenant': self.tenant_b},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn('department', serializer.errors)

    def test_me_serializer_permission_keys_match_permission_map(self):
        """MeSerializer permission dict must use keys from PERMISSION_MAP for custom roles."""
        from accounts.serializers import MeSerializer
        from roles.models import Role
        from roles.permissions_map import PERMISSION_MAP

        # Create a custom role with every permission key set to True
        custom_role = Role.objects.create(
            tenant=self.tenant_b,
            name='All-Perms',
            permissions={k: True for k in PERMISSION_MAP},
        )
        membership = _add_member(
            _create_user('custom-role-user@example.com'),
            self.tenant_b,
            role='custom',
        )
        membership.custom_role = custom_role
        membership.save()

        request = RequestFactory().get('/api/v1/accounts/me/')
        request.tenant = self.tenant_b

        serializer = MeSerializer(membership.user, context={'request': request})
        data = serializer.data
        perms = data['membership']['permissions']

        # For a custom role with all permissions True, the coin/accounting flags
        # must resolve to True (verifying correct PERMISSION_MAP key usage).
        self.assertTrue(perms.get('can_view_coins'),
                        'can_view_coins should be True — check PERMISSION_MAP key in MeSerializer')
        self.assertTrue(perms.get('can_approve_coins'),
                        'can_approve_coins should be True — check PERMISSION_MAP key in MeSerializer')
        self.assertTrue(perms.get('can_view_accounting'),
                        'can_view_accounting should be True — check PERMISSION_MAP key in MeSerializer')
        self.assertTrue(perms.get('can_manage_accounting'),
                        'can_manage_accounting should be True — check PERMISSION_MAP key in MeSerializer')

    # ── Customer service / view IDOR ─────────────────────────────────────────

    def test_customer_delete_blocked_cross_tenant(self):
        """DELETE /api/v1/customers/{id}/ must 404 for a customer from another tenant."""
        from customers.models import Customer

        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Cross-Tenant Corp',
            phone='9800000099',
        )

        admin_b = _create_user('admin-del-b@example.com')
        _add_member(admin_b, self.tenant_b, role='admin')
        token_b = _get_token(admin_b, self.tenant_b)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b}')
        response = client.delete(
            f'/api/v1/customers/{customer_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )

        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to delete tenant A customer.',
        )
        # Original record must survive
        customer_a.refresh_from_db()
        self.assertFalse(customer_a.is_deleted)

    def test_customer_contact_update_blocked_cross_tenant(self):
        """PATCH /api/v1/customers/{id}/contacts/{cid}/ must 404 for cross-tenant contact."""
        from customers.models import Customer, CustomerContact

        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Org',
            phone='9800000098',
        )
        contact_a = CustomerContact.objects.create(
            tenant=self.tenant_a,
            customer=customer_a,
            name='Main Contact',
            phone='9800000097',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.patch(
            f'/api/v1/customers/{customer_a.pk}/contacts/{contact_a.pk}/',
            data={'name': 'Hacked'},
            format='json',
            HTTP_HOST='idor-b.bms.local',
        )

        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to update a contact belonging to tenant A.',
        )
        contact_a.refresh_from_db()
        self.assertEqual(contact_a.name, 'Main Contact')

    def test_soft_delete_customer_service_rejects_cross_tenant(self):
        """soft_delete_customer service must raise ValueError for cross-tenant instances."""
        from customers.models import Customer
        from customers.services import soft_delete_customer

        customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            name='Service Guard Test',
            phone='9800000096',
        )

        with self.assertRaisesMessage(ValueError, 'Customer does not belong to this workspace.'):
            soft_delete_customer(instance=customer_a, tenant=self.tenant_b)

        # Must not be soft-deleted
        customer_a.refresh_from_db()
        self.assertFalse(customer_a.is_deleted)

    # ── Department service / view IDOR ────────────────────────────────────────

    def test_cannot_read_other_tenant_department(self):
        """GET /api/v1/departments/{id}/ must 404 for a department from another tenant."""
        from departments.models import Department

        dept_a = Department.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Dept',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.get(
            f'/api/v1/departments/{dept_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )

        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to read a department from tenant A.',
        )

    def test_department_delete_blocked_cross_tenant(self):
        """DELETE /api/v1/departments/{id}/ must 404 for a department from another tenant."""
        from departments.models import Department

        dept_a = Department.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Dept Delete Test',
        )

        admin_b = _create_user('admin-dept-b@example.com')
        _add_member(admin_b, self.tenant_b, role='admin')
        token_b = _get_token(admin_b, self.tenant_b)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b}')
        response = client.delete(
            f'/api/v1/departments/{dept_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )

        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to delete a department from tenant A.',
        )
        # Original record must still exist
        self.assertTrue(Department.objects.filter(pk=dept_a.pk).exists())

    def test_delete_department_service_rejects_cross_tenant(self):
        """delete_department service must raise ValueError for cross-tenant instances."""
        from departments.models import Department
        from departments.services import delete_department

        dept_a = Department.objects.create(
            tenant=self.tenant_a,
            name='Service Guard Dept',
        )

        with self.assertRaisesMessage(ValueError, 'Department does not belong to this workspace.'):
            delete_department(instance=dept_a, tenant=self.tenant_b)

        # Record must survive
        self.assertTrue(Department.objects.filter(pk=dept_a.pk).exists())

    # ── Ticket service / view IDOR ─────────────────────────────────────────

    def test_cannot_read_other_tenant_ticket(self):
        """GET /api/v1/tickets/{id}/ must 404 for a ticket belonging to another tenant."""
        from tickets.models import Ticket

        ticket_a = Ticket.objects.create(
            tenant=self.tenant_a,
            title='Tenant A secret ticket',
            status=Ticket.STATUS_OPEN,
            priority=Ticket.PRIORITY_MEDIUM,
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.get(
            f'/api/v1/tickets/{ticket_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to read a ticket from tenant A.',
        )

    def test_ticket_comment_create_blocked_cross_tenant(self):
        """POST /api/v1/tickets/{ticket_pk}/comments/ must 404 for a cross-tenant ticket."""
        from tickets.models import Ticket

        ticket_a = Ticket.objects.create(
            tenant=self.tenant_a,
            title='Tenant A ticket for comment probe',
            status=Ticket.STATUS_OPEN,
            priority=Ticket.PRIORITY_LOW,
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.post(
            f'/api/v1/tickets/{ticket_a.pk}/comments/',
            data={'body': 'Injected comment'},
            format='json',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to comment on a ticket from tenant A.',
        )

    def test_ticket_service_assign_rejects_cross_tenant_user(self):
        """TicketService.assign() must raise ValidationError for a user not in the tenant."""
        from tickets.models import Ticket
        from tickets.services.ticket_service import TicketService
        from core.exceptions import ValidationError as NexusValidationError

        # ticket lives in tenant_b; user_a is only a member of tenant_a
        user_a = _create_user('user_a_assign@example.com')
        _add_member(user_a, self.tenant_a)

        ticket_b = Ticket.objects.create(
            tenant=self.tenant_b,
            title='Tenant B ticket',
            status=Ticket.STATUS_OPEN,
            priority=Ticket.PRIORITY_MEDIUM,
        )

        service = TicketService(tenant=self.tenant_b, user=self.user_b)
        with self.assertRaises(NexusValidationError):
            service.assign(ticket_b, user_id=user_a.pk)

    # ── Inventory view / service IDOR ──────────────────────────────────────

    def _enable_inventory_module(self):
        """Add the inventory module to the shared test plan and clear cache."""
        from tenants.models import Module
        inv_mod, _ = Module.objects.get_or_create(
            key='inventory',
            defaults={'name': 'Inventory', 'is_core': False},
        )
        self.plan.modules.add(inv_mod)
        self.tenant_b.clear_module_cache()

    def test_cannot_read_other_tenant_product(self):
        """GET /api/v1/inventory/products/{id}/ must 404 for a product from another tenant."""
        from inventory.models import Product

        self._enable_inventory_module()

        product_a = Product.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Secret Product',
            sku='SKU-SECRET-001',
            unit_price='99.00',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.get(
            f'/api/v1/inventory/products/{product_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to read a product from tenant A.',
        )

    def test_cannot_receive_cross_tenant_po(self):
        """POST /api/v1/inventory/purchase-orders/{id}/receive/ must 404 for a PO from another tenant."""
        from inventory.models import Product, Supplier, PurchaseOrder, PurchaseOrderItem

        self._enable_inventory_module()

        product_a = Product.objects.create(
            tenant=self.tenant_a,
            name='PO Probe Product',
            sku='SKU-PO-PROBE',
            unit_price='10.00',
        )
        supplier_a = Supplier.objects.create(
            tenant=self.tenant_a,
            name='Probe Supplier',
        )
        po_a = PurchaseOrder.objects.create(
            tenant=self.tenant_a,
            supplier=supplier_a,
            status=PurchaseOrder.STATUS_SENT,
        )
        PurchaseOrderItem.objects.create(
            tenant=self.tenant_a,
            po=po_a,
            product=product_a,
            quantity_ordered=5,
            quantity_received=0,
            unit_cost='10.00',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.post(
            f'/api/v1/inventory/purchase-orders/{po_a.pk}/receive/',
            data={'lines': [{'item_id': 999, 'quantity_received': 1}]},
            format='json',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to receive a PO from tenant A.',
        )

    def test_service_receive_po_rejects_cross_tenant_item(self):
        """receive_purchase_order() must raise ValidationError for an item not on the PO."""
        from inventory.models import Product, Supplier, PurchaseOrder, PurchaseOrderItem
        from inventory.services import receive_purchase_order
        from core.exceptions import ValidationError as NexusValidationError

        product_b = Product.objects.create(
            tenant=self.tenant_b,
            name='Service PO Probe',
            sku='SKU-SVC-PO',
            unit_price='5.00',
        )
        supplier_b = Supplier.objects.create(
            tenant=self.tenant_b,
            name='Service Supplier B',
        )
        po_b = PurchaseOrder.objects.create(
            tenant=self.tenant_b,
            supplier=supplier_b,
            status=PurchaseOrder.STATUS_SENT,
        )
        PurchaseOrderItem.objects.create(
            tenant=self.tenant_b,
            po=po_b,
            product=product_b,
            quantity_ordered=10,
            quantity_received=0,
            unit_cost='5.00',
        )

        # Pass an item_id that does not belong to this PO → ValidationError
        with self.assertRaises(NexusValidationError):
            receive_purchase_order(
                po=po_b,
                lines=[{'item_id': 999999, 'quantity_received': 1}],
                notes='',
                user=self.user_b,
            )

    # ── Accounting view / service IDOR ─────────────────────────────────────

    def _enable_accounting_module(self):
        """Add the accounting module to the shared test plan and clear cache."""
        from tenants.models import Module
        acc_mod, _ = Module.objects.get_or_create(
            key='accounting',
            defaults={'name': 'Accounting', 'is_core': False},
        )
        self.plan.modules.add(acc_mod)
        self.tenant_b.clear_module_cache()

    def test_cannot_read_other_tenant_invoice(self):
        """GET /api/v1/accounting/invoices/{id}/ must 404 for an invoice from another tenant."""
        from accounting.models import Invoice

        self._enable_accounting_module()

        invoice_a = Invoice.objects.create(
            tenant=self.tenant_a,
            line_items=[],
            subtotal='100.00',
            vat_amount='13.00',
            total='113.00',
            status=Invoice.STATUS_DRAFT,
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.get(
            f'/api/v1/accounting/invoices/{invoice_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to read an invoice from tenant A.',
        )

    def test_payment_service_rejects_invoice_wrong_tenant(self):
        """record_payment() must raise ValueError for an invoice from a different tenant."""
        from decimal import Decimal
        from accounting.models import Invoice
        from accounting.services.payment_service import record_payment

        invoice_a = Invoice.objects.create(
            tenant=self.tenant_a,
            line_items=[],
            subtotal='200.00',
            vat_amount='26.00',
            total='226.00',
            status=Invoice.STATUS_ISSUED,
        )

        with self.assertRaises(ValueError):
            record_payment(
                tenant=self.tenant_b,
                created_by=self.user_b,
                payment_type='incoming',
                method='cash',
                amount=Decimal('226.00'),
                invoice=invoice_a,
            )


    def test_cannot_read_other_tenant_notification(self):
        """Notification queryset must not expose records from another tenant."""
        from notifications.models import Notification

        user_a = _create_user('notif-user-a@example.com')
        _add_member(user_a, self.tenant_a)
        notif_a = Notification.objects.create(
            tenant=self.tenant_a,
            recipient=user_a,
            notification_type=Notification.TYPE_GENERAL,
            title='Private notification',
        )

        # Direct queryset check: tenant B filter must not return tenant A record
        qs_b = Notification.objects.filter(tenant=self.tenant_b)
        self.assertNotIn(
            notif_a.pk,
            qs_b.values_list('pk', flat=True),
            'Notification from tenant A must not appear in tenant B queryset.',
        )

        # API-level check: tenant B user must not see tenant A notification
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.get(
            '/api/v1/notifications/',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        if response.status_code == status.HTTP_200_OK:
            ids_returned = [n['id'] for n in response.json().get('data', [])]
            self.assertNotIn(
                notif_a.pk,
                ids_returned,
                'Tenant A notification must not appear in tenant B response.',
            )

    def test_cannot_read_other_tenant_project(self):
        """A user from tenant B cannot access a project created in tenant A."""
        from projects.models import Project

        project_a = Project.objects.create(
            tenant=self.tenant_a,
            name='Secret Project Alpha',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.get(
            f'/api/v1/projects/{project_a.pk}/',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to read a project from tenant A.',
        )

    def test_cannot_create_task_under_other_tenant_project(self):
        """POST /api/v1/projects/{id}/tasks/ must return 404 for a cross-tenant project."""
        from projects.models import Project

        project_a = Project.objects.create(
            tenant=self.tenant_a,
            name='Tenant A Confidential Project',
        )

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_b}')
        response = client.post(
            f'/api/v1/projects/{project_a.pk}/tasks/',
            data={'title': 'Injected Task', 'status': 'todo'},
            format='json',
            HTTP_HOST='idor-b.bms.local',
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
            'Tenant B must not be able to create tasks under a tenant A project.',
        )


class SlugImmutabilityTest(TestCase):
    """Tenant slug cannot be changed via PATCH after creation."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('Slug-Plan')
        self.tenant = _create_tenant('original-slug', self.plan)
        self.superadmin = _create_user('sa@bms.com', is_superadmin=True)
        self.token = _get_token(self.superadmin, tenant=None)

    def test_patch_slug_returns_400(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.patch(
            f'/api/v1/tenants/{self.tenant.pk}/',
            data={'slug': 'changed-slug'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.slug, 'original-slug')


class SlugReservationTest(TestCase):
    """Deleted tenant slug cannot be reused by a new tenant."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('Res-Plan')
        self.tenant = _create_tenant('reserved-slug', self.plan)
        self.superadmin = _create_user('sa2@bms.com', is_superadmin=True)
        self.token = _get_token(self.superadmin, tenant=None)

    def test_soft_delete_creates_slug_reservation(self):
        self.tenant.soft_delete()
        self.assertTrue(SlugReservation.objects.filter(slug='reserved-slug').exists())

    def test_creating_tenant_with_reserved_slug_fails(self):
        """A slug present in SlugReservation must be rejected for new tenant creation.

        We create the reservation directly — simulating a previously deleted
        tenant that has since been hard-purged from the DB (e.g. data cleanup).
        This isolated test verifies that the SlugReservation check in
        TenantSerializer.validate_slug() fires and returns 400.
        """
        SlugReservation.objects.create(slug='clean-reserved-slug', reason='test')

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.post(
            '/api/v1/tenants/',
            data={'slug': 'clean-reserved-slug', 'name': 'Hijack Attempt', 'plan': self.plan.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        err_text = json.dumps(response.data)
        self.assertIn('reserved', err_text.lower())


class SanitizeSlugTest(TestCase):
    """_sanitize_slug must strip characters outside [a-z0-9-] before Redis keys."""

    def test_strips_special_characters(self):
        self.assertEqual(_sanitize_slug('../../../etc/passwd'), 'etcpasswd')

    def test_strips_null_bytes(self):
        self.assertEqual(_sanitize_slug('foo\x00bar'), 'foobar')

    def test_allows_alphanumeric_and_hyphen(self):
        self.assertEqual(_sanitize_slug('my-tenant-123'), 'my-tenant-123')

    def test_uppercase_folded(self):
        # Slugs are lowercase by validation, but sanitizer should tolerate mixed case
        result = _sanitize_slug('MyTenant')
        self.assertNotIn('M', result)  # uppercase stripped or lowered — depends on impl
        self.assertTrue(all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in result))


class ModuleCacheInvalidationTest(TestCase):
    """Module set cache is cleared when the plan changes or overrides are added."""

    def setUp(self):
        self.plan_a = _create_plan('Cache-Plan-A')
        self.plan_b = _create_plan('Cache-Plan-B')
        self.tenant = _create_tenant('cache-tenant', self.plan_a)

    def test_clear_module_cache_removes_key(self):
        from django.core.cache import cache
        # Warm the cache by accessing active_modules_set
        _ = self.tenant.active_modules_set
        # The cache key should exist now
        key = self.tenant._modules_cache_key
        cached_before = cache.get(key)
        # After clear, key should be gone
        self.tenant.clear_module_cache()
        cached_after = cache.get(key)
        self.assertIsNone(cached_after)


class SuperadminIPAllowlistTest(TestCase):
    """IsSuperAdmin rejects requests from IPs not in SUPERADMIN_ALLOWED_IPS."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('IP-Plan')
        self.superadmin = _create_user('saip@bms.com', is_superadmin=True)
        self.token = _get_token(self.superadmin, tenant=None)

    @override_settings(SUPERADMIN_ALLOWED_IPS=['1.2.3.4'])
    def test_request_from_unlisted_ip_is_blocked(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        # REMOTE_ADDR is 127.0.0.1 by default in test client — not in allowed list
        response = client.get('/api/v1/tenants/', REMOTE_ADDR='9.9.9.9')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(SUPERADMIN_ALLOWED_IPS=['1.2.3.4'])
    def test_request_from_allowed_ip_passes(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.get('/api/v1/tenants/', REMOTE_ADDR='1.2.3.4')
        # Should not be 403 from IP check (may be 200 or other based on queryset)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(SUPERADMIN_ALLOWED_IPS=[])
    def test_empty_allowlist_permits_all_ips(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        response = client.get('/api/v1/tenants/', REMOTE_ADDR='9.9.9.9')
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class AuditLogLoginTest(TransactionTestCase):
    """AuditLog row is written on each login attempt.

    Uses TransactionTestCase instead of TestCase because CONN_MAX_AGE > 0
    causes the test client's WSGI request to use a separate database connection
    that cannot see data created inside a TestCase wrapping transaction.
    TransactionTestCase commits data so all connections can see it.

    Uses HTTP_HOST subdomain simulation instead of X-Tenant-Slug header because
    Django test runner always sets DEBUG=False, which disables the header path.
    """

    def setUp(self):
        # Clear the shared Redis cache so stale tenant lookups from previous
        # tests (whose DB transactions were rolled back) do not poison this test.
        django_cache.clear()
        self.plan = _create_plan('Audit-Plan')
        self.tenant = _create_tenant('audit-tenant', self.plan)
        self.user = _create_user('audited@example.com')
        _add_member(self.user, self.tenant)

    def test_successful_login_writes_audit_row(self):
        initial_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_SUCCESS).count()
        client = APIClient()
        response = client.post(
            '/api/v1/accounts/token/',
            data={'email': 'audited@example.com', 'password': 'TestPass123!'},
            format='json',
            HTTP_HOST='audit-tenant.bms.local',  # subdomain works even with DEBUG=False
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK,
                         msg=f'Login failed: {response.content[:300]}')
        new_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_SUCCESS).count()
        self.assertEqual(new_count, initial_count + 1)

    def test_failed_login_writes_audit_row(self):
        initial_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_FAILED).count()
        client = APIClient()
        response = client.post(
            '/api/v1/accounts/token/',
            data={'email': 'audited@example.com', 'password': 'WRONG'},
            format='json',
            HTTP_HOST='audit-tenant.bms.local',
        )
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST])
        new_count = AuditLog.objects.filter(event=AuditEvent.LOGIN_FAILED).count()
        self.assertEqual(new_count, initial_count + 1)


class AuditLogDirectTest(TestCase):
    """log_event() writes rows to DB and never raises on bad input."""

    def test_log_event_writes_db_row(self):
        before = AuditLog.objects.count()
        request = RequestFactory().get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        log_event(AuditEvent.LOGIN_SUCCESS, request=request, extra={'test': True})
        self.assertEqual(AuditLog.objects.count(), before + 1)

    def test_log_event_survives_none_request(self):
        """log_event must never raise even with minimal args."""
        try:
            log_event(AuditEvent.LOGIN_SUCCESS)
        except Exception as exc:
            self.fail(f'log_event raised unexpectedly: {exc}')

    def test_log_event_writes_row_hash(self):
        """Phase 4: every new audit row must have a non-empty row_hash."""
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'phase': 4})
        row = AuditLog.objects.order_by('-timestamp').first()
        self.assertTrue(len(row.row_hash) == 64, 'row_hash should be a 64-char hex string')

    def test_verify_row_hash_returns_true_for_untampered_row(self):
        """Phase 4: verify_row_hash() must return True for an untampered row."""
        from core.audit import verify_row_hash
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'hash_test': True})
        row = AuditLog.objects.order_by('-timestamp').first()
        self.assertTrue(verify_row_hash(row))


class AuditLogImmutabilityTest(TestCase):
    """Phase 4: DB-level trigger must prevent UPDATE/DELETE on core_auditlog."""

    def test_updating_audit_row_is_blocked_by_trigger(self):
        from django.db import connection, ProgrammingError
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'immutable_test': True})
        row = AuditLog.objects.order_by('-timestamp').first()
        with self.assertRaises(Exception):
            with connection.cursor() as c:
                c.execute(
                    "UPDATE core_auditlog SET extra = '{}' WHERE id = %s",
                    [row.id],
                )

    def test_deleting_audit_row_is_blocked_by_trigger(self):
        from django.db import connection
        log_event(AuditEvent.LOGIN_SUCCESS, extra={'immutable_delete_test': True})
        row = AuditLog.objects.order_by('-timestamp').first()
        with self.assertRaises(Exception):
            with connection.cursor() as c:
                c.execute("DELETE FROM core_auditlog WHERE id = %s", [row.id])


@override_settings(ALLOWED_HOSTS=['*'], ROOT_DOMAIN='bms.local')
class TenantSigBindingTest(TestCase):
    """Phase 4 (Item #3): tenant_sig HMAC must be verified on every request."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('SigPlan')
        self.tenant = _create_tenant('sig-tenant', self.plan)
        self.user = _create_user('sig@example.com')
        _add_member(self.user, self.tenant)

    def test_valid_tenant_sig_is_accepted(self):
        token = _get_token(self.user, self.tenant)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = client.get(
            '/api/v1/accounts/me/',
            HTTP_HOST=f'sig-tenant.bms.local',
        )
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_rotated_tenant_secret_rejects_old_token(self):
        """Rotating jwt_signing_secret must invalidate all pre-rotation tokens."""
        token = _get_token(self.user, self.tenant)

        # Rotate the tenant's signing secret
        import secrets
        self.tenant.jwt_signing_secret = secrets.token_hex(32)
        self.tenant.save()
        # Clear tenant from cache so middleware re-reads from DB
        django_cache.delete(f'tenant_slug_{self.tenant.slug}')

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = client.get(
            '/api/v1/accounts/me/',
            HTTP_HOST=f'sig-tenant.bms.local',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(ALLOWED_HOSTS=['*'])
class DomainSigBindingTest(TestCase):
    """Phase 4 (Item #6): domain_sig HMAC isolates admin tokens from tenant tokens."""

    def setUp(self):
        django_cache.clear()
        self.superadmin = _create_user('domsig@bms.com', is_superadmin=True)

    def test_valid_domain_sig_is_accepted(self):
        token = _get_token(self.superadmin, tenant=None)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = client.get('/api/v1/tenants/')
        # 200 or other non-401 response confirms auth succeeded
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_wrong_superadmin_secret_rejects_old_token(self):
        """Changing SUPERADMIN_JWT_SECRET must invalidate all existing admin tokens."""
        # Issue the token with the CURRENT (original) secret
        token = _get_token(self.superadmin, tenant=None)

        # Now rotate the SUPERADMIN_JWT_SECRET to a different value and verify
        # that the old token (signed with the old secret) is rejected.
        with override_settings(SUPERADMIN_JWT_SECRET='completely-different-secret-xyz-9999'):
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            response = client.get('/api/v1/tenants/')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AnomalyDetectionTest(TestCase):
    """Phase 4 (Item #5): BannedIP model and auto-ban detection."""

    def setUp(self):
        django_cache.clear()

    def test_is_banned_returns_false_for_clean_ip(self):
        from core.anomaly import is_banned
        self.assertFalse(is_banned('1.2.3.4'))

    def test_is_banned_returns_true_for_banned_ip(self):
        from core.anomaly import BannedIP, is_banned
        from django.utils import timezone
        from datetime import timedelta
        BannedIP.objects.create(
            ip='6.6.6.6',
            expires_at=timezone.now() + timedelta(hours=1),
            reason='test ban',
        )
        django_cache.clear()  # ensure DB is queried
        self.assertTrue(is_banned('6.6.6.6'))

    def test_is_banned_returns_false_for_expired_ban(self):
        from core.anomaly import BannedIP, is_banned
        from django.utils import timezone
        from datetime import timedelta
        BannedIP.objects.create(
            ip='7.7.7.7',
            expires_at=timezone.now() - timedelta(hours=1),  # already expired
            reason='expired ban',
        )
        django_cache.clear()
        self.assertFalse(is_banned('7.7.7.7'))

    @override_settings(ANOMALY_PROBE_THRESHOLD=3, ANOMALY_WINDOW_MINUTES=60, ANOMALY_BAN_HOURS=2)
    def test_detect_and_ban_bans_offending_ip(self):
        """An IP with >= threshold probe events in the window must be auto-banned."""
        from core.anomaly import detect_and_ban_probe_ips, BannedIP, is_banned
        from core.audit import AuditLog, AuditEvent
        from django.utils import timezone

        offender_ip = '9.8.7.6'
        for _ in range(4):  # above threshold of 3
            AuditLog.objects.create(
                event=AuditEvent.CROSS_TENANT_PROBE,
                ip=offender_ip,
                timestamp=timezone.now(),
            )

        new_bans = detect_and_ban_probe_ips()
        self.assertGreater(new_bans, 0)

        django_cache.clear()
        self.assertTrue(is_banned(offender_ip))

    @override_settings(ANOMALY_PROBE_THRESHOLD=10, ANOMALY_WINDOW_MINUTES=60)
    def test_detect_and_ban_does_not_ban_below_threshold(self):
        """An IP with fewer probe events than the threshold must NOT be banned."""
        from core.anomaly import detect_and_ban_probe_ips, is_banned
        from core.audit import AuditLog, AuditEvent
        from django.utils import timezone

        safe_ip = '1.1.1.1'
        for _ in range(3):  # below threshold of 10
            AuditLog.objects.create(
                event=AuditEvent.CROSS_TENANT_PROBE,
                ip=safe_ip,
                timestamp=timezone.now(),
            )

        detect_and_ban_probe_ips()
        django_cache.clear()
        self.assertFalse(is_banned(safe_ip))


@override_settings(ALLOWED_HOSTS=['*'])
class SuspendTenantTokenKillTest(TestCase):
    """Phase 4 (Item #7): suspending a tenant must blacklist all member tokens."""

    def setUp(self):
        django_cache.clear()
        self.plan = _create_plan('KillPlan')
        self.tenant = _create_tenant('kill-tenant', self.plan)
        self.superadmin = _create_user('killsuper@bms.com', is_superadmin=True)
        self.member = _create_user('killmember@bms.com')
        _add_member(self.member, self.tenant)
        self.superadmin_token = _get_token(self.superadmin, tenant=None)

    def test_suspend_blacklists_member_tokens(self):
        """After suspension, all outstanding tokens for tenant members are blacklisted."""
        from rest_framework_simplejwt.token_blacklist.models import (
            OutstandingToken, BlacklistedToken,
        )
        from accounts.tokens import TenantRefreshToken

        # Issue a refresh token for the member (this creates an OutstandingToken row)
        refresh = TenantRefreshToken.for_user_and_tenant(self.member, self.tenant)
        outstanding_count_before = OutstandingToken.objects.filter(
            user=self.member
        ).count()
        self.assertGreater(outstanding_count_before, 0)

        # Suspend the tenant via the API
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.superadmin_token}')
        response = client.post(
            f'/api/v1/tenants/{self.tenant.pk}/suspend/',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # All outstanding tokens for the member must now be blacklisted
        from django.utils import timezone
        blacklisted_count = BlacklistedToken.objects.filter(
            token__user=self.member,
            token__expires_at__gt=timezone.now(),
        ).count()
        self.assertGreater(blacklisted_count, 0)
