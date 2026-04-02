"""
inventory/tests/test_listeners.py
===================================
Tests for inventory EventBus listeners:
  - invoice.sent → StockMovement(OUT) created per product line
  - invoice.cancelled → OUT movements reversed
  - project.completed → StockMovement(OUT) per ProjectProduct
  - project.cancelled → project stock reversed

Run inside Docker:
    docker exec nexus_bms-web-1 python -m pytest inventory/tests/test_listeners.py -v
"""
import pytest
from decimal import Decimal

from tenants.models import Tenant, Plan
from accounts.models import User, TenantMembership
from inventory.models import Product, StockMovement
from core.events import EventBus


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _plan():
    return Plan.objects.get_or_create(
        slug='basic', defaults={'name': 'Basic', 'description': 'Test plan'},
    )[0]


def _tenant(slug='invtest'):
    return Tenant.objects.create(
        name=f'Tenant {slug}', slug=slug, plan=_plan(), is_active=True,
    )


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


def _product(tenant, admin, name='Widget', price=Decimal('100.00')):
    return Product.objects.create(
        tenant=tenant,
        name=name,
        unit_price=price,
        track_stock=True,
        created_by=admin,
    )


def _invoice(tenant, admin, products_with_qty):
    """Create an Invoice with product-type line items."""
    from accounting.models import Invoice

    line_items = [
        {
            'line_type': 'product',
            'product_id': prod.pk,
            'description': prod.name,
            'qty': qty,
            'unit_price': str(prod.unit_price),
            'subtotal': str(prod.unit_price * qty),
        }
        for prod, qty in products_with_qty
    ]
    return Invoice.objects.create(
        tenant=tenant,
        created_by=admin,
        status='sent',
        line_items=line_items,
        subtotal=sum(prod.unit_price * qty for prod, qty in products_with_qty),
        vat_amount=Decimal('0'),
        total=sum(prod.unit_price * qty for prod, qty in products_with_qty),
    )


# ─── invoice.sent listener ────────────────────────────────────────────────────

@pytest.mark.django_db
def test_invoice_sent_creates_stock_out_movements():
    """invoice.sent creates MOVEMENT_OUT for each product line item."""
    tenant = _tenant('inv-sent')
    admin = _user('admin@inv-sent.com')
    _member(admin, tenant, role='admin')
    product = _product(tenant, admin, 'Laptop', Decimal('50000'))

    invoice = _invoice(tenant, admin, [(product, 2)])

    EventBus.publish('invoice.sent', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    movements = StockMovement.objects.filter(
        tenant=tenant,
        product=product,
        movement_type=StockMovement.MOVEMENT_OUT,
        reference_type='invoice',
        reference_id=invoice.pk,
    )
    assert movements.count() == 1
    assert movements.first().quantity == 2


@pytest.mark.django_db
def test_invoice_sent_idempotent():
    """Firing invoice.sent twice does not create duplicate movements."""
    tenant = _tenant('inv-sent-idem')
    admin = _user('admin@inv-sent-idem.com')
    _member(admin, tenant, role='admin')
    product = _product(tenant, admin)

    invoice = _invoice(tenant, admin, [(product, 1)])

    EventBus.publish('invoice.sent', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)
    EventBus.publish('invoice.sent', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    count = StockMovement.objects.filter(
        tenant=tenant,
        product=product,
        movement_type=StockMovement.MOVEMENT_OUT,
        reference_type='invoice',
        reference_id=invoice.pk,
    ).count()
    assert count == 1


@pytest.mark.django_db
def test_invoice_sent_skips_service_lines():
    """Service-type line items (no product_id) do not generate movements."""
    tenant = _tenant('inv-svc-skip')
    admin = _user('admin@inv-svc-skip.com')
    _member(admin, tenant, role='admin')

    from accounting.models import Invoice

    invoice = Invoice.objects.create(
        tenant=tenant,
        created_by=admin,
        status='sent',
        line_items=[
            {
                'line_type': 'service',
                'description': 'Labour fee',
                'qty': 1,
                'unit_price': '500',
                'subtotal': '500',
            }
        ],
        subtotal=Decimal('500'),
        vat_amount=Decimal('0'),
        total=Decimal('500'),
    )

    EventBus.publish('invoice.sent', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    assert StockMovement.objects.filter(tenant=tenant, reference_id=invoice.pk).count() == 0


# ─── invoice.cancelled listener ───────────────────────────────────────────────

@pytest.mark.django_db
def test_invoice_cancelled_reverses_stock_out():
    """invoice.cancelled creates MOVEMENT_IN to reverse prior MOVEMENT_OUT."""
    tenant = _tenant('inv-cancel')
    admin = _user('admin@inv-cancel.com')
    _member(admin, tenant, role='admin')
    product = _product(tenant, admin, 'Monitor')

    invoice = _invoice(tenant, admin, [(product, 3)])

    # First issue the invoice to create OUT movements
    EventBus.publish('invoice.sent', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    # Now cancel
    EventBus.publish('invoice.cancelled', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    in_movements = StockMovement.objects.filter(
        tenant=tenant,
        product=product,
        movement_type=StockMovement.MOVEMENT_IN,
        reference_type='invoice',
        reference_id=invoice.pk,
    )
    assert in_movements.count() == 1
    assert in_movements.first().quantity == 3


@pytest.mark.django_db
def test_invoice_cancelled_reversal_idempotent():
    """Firing invoice.cancelled twice does not double-reverse."""
    tenant = _tenant('inv-cancel-idem')
    admin = _user('admin@inv-cancel-idem.com')
    _member(admin, tenant, role='admin')
    product = _product(tenant, admin, 'Keyboard')

    invoice = _invoice(tenant, admin, [(product, 1)])

    EventBus.publish('invoice.sent', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)
    EventBus.publish('invoice.cancelled', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)
    EventBus.publish('invoice.cancelled', {'id': invoice.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    in_count = StockMovement.objects.filter(
        tenant=tenant,
        product=product,
        movement_type=StockMovement.MOVEMENT_IN,
        reference_type='invoice',
        reference_id=invoice.pk,
    ).count()
    assert in_count == 1


# ─── project.completed listener ───────────────────────────────────────────────

@pytest.mark.django_db
def test_project_completed_creates_stock_out_per_product():
    """project.completed creates MOVEMENT_OUT for each ProjectProduct."""
    from projects.models import Project, ProjectProduct

    tenant = _tenant('proj-comp-stock')
    admin = _user('admin@proj-comp-stock.com')
    _member(admin, tenant, role='admin')
    product_a = _product(tenant, admin, 'Cable', Decimal('200'))
    product_b = _product(tenant, admin, 'Adapter', Decimal('500'))

    project = Project.objects.create(
        tenant=tenant, created_by=admin, name='Install', status='active',
    )
    ProjectProduct.objects.create(tenant=tenant, project=project, product=product_a, quantity_planned=4)
    ProjectProduct.objects.create(tenant=tenant, project=project, product=product_b, quantity_planned=2)

    EventBus.publish('project.completed', {'id': project.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    out_a = StockMovement.objects.filter(
        tenant=tenant, product=product_a,
        movement_type=StockMovement.MOVEMENT_OUT, reference_type='project', reference_id=project.pk,
    )
    out_b = StockMovement.objects.filter(
        tenant=tenant, product=product_b,
        movement_type=StockMovement.MOVEMENT_OUT, reference_type='project', reference_id=project.pk,
    )
    assert out_a.count() == 1
    assert out_a.first().quantity == 4
    assert out_b.count() == 1
    assert out_b.first().quantity == 2


@pytest.mark.django_db
def test_project_completed_stock_out_idempotent():
    """Firing project.completed twice does not duplicate movements."""
    from projects.models import Project, ProjectProduct

    tenant = _tenant('proj-comp-idem')
    admin = _user('admin@proj-comp-idem.com')
    _member(admin, tenant, role='admin')
    product = _product(tenant, admin, 'Bolt')

    project = Project.objects.create(
        tenant=tenant, created_by=admin, name='Wiring', status='active',
    )
    ProjectProduct.objects.create(tenant=tenant, project=project, product=product, quantity_planned=5)

    payload = {'id': project.pk, 'tenant_id': tenant.pk}
    EventBus.publish('project.completed', payload, tenant=tenant)
    EventBus.publish('project.completed', payload, tenant=tenant)

    count = StockMovement.objects.filter(
        tenant=tenant, product=product,
        movement_type=StockMovement.MOVEMENT_OUT, reference_type='project', reference_id=project.pk,
    ).count()
    assert count == 1


# ─── project.cancelled listener ───────────────────────────────────────────────

@pytest.mark.django_db
def test_project_cancelled_reverses_stock_out():
    """project.cancelled creates MOVEMENT_IN to reverse project MOVEMENT_OUT."""
    from projects.models import Project, ProjectProduct

    tenant = _tenant('proj-cancel-stock')
    admin = _user('admin@proj-cancel-stock.com')
    _member(admin, tenant, role='admin')
    product = _product(tenant, admin, 'Router')

    project = Project.objects.create(
        tenant=tenant, created_by=admin, name='Network Install', status='active',
    )
    ProjectProduct.objects.create(tenant=tenant, project=project, product=product, quantity_planned=3)

    # Complete first to create OUT movements
    EventBus.publish('project.completed', {'id': project.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    # Now cancel reverses them
    EventBus.publish('project.cancelled', {'id': project.pk, 'tenant_id': tenant.pk}, tenant=tenant)

    in_movements = StockMovement.objects.filter(
        tenant=tenant, product=product,
        movement_type=StockMovement.MOVEMENT_IN, reference_type='project', reference_id=project.pk,
    )
    assert in_movements.count() == 1
    assert in_movements.first().quantity == 3
