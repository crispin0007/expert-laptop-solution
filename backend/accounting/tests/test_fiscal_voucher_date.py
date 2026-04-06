import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.request import Request as DrfRequest
from rest_framework.test import APIRequestFactory

from accounts.models import TenantMembership
from accounting.models import Bill, CreditNote, DebitNote, Invoice, Quotation
from accounting.services.credit_note_service import CreditNoteService
from accounting.services.invoice_service import InvoiceService
from accounting.views import DebitNoteViewSet, QuotationViewSet
from core.nepali_date import fiscal_year_of
from tenants.models import Tenant


@pytest.fixture
def tenant(db):
    return Tenant.objects.create(
        name='Fiscal Test Co',
        slug='fiscal-test-co',
        vat_enabled=True,
        vat_rate=Decimal('0.13'),
        coin_to_money_rate=Decimal('10'),
    )


@pytest.fixture
def admin_user(db, tenant):
    user = get_user_model().objects.create_user(
        username='fiscal_admin',
        email='fiscal-admin@example.com',
        password='testpassword',
    )
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    return user


def _build_view(viewset_cls, tenant, user, params=None):
    raw = APIRequestFactory().get('/api/v1/accounting/', data=params or {})
    req = DrfRequest(raw)
    req.tenant = tenant
    req.user = user

    view = viewset_cls()
    view.request = req
    view.tenant = tenant
    view.action = 'list'
    view.kwargs = {}
    return view


@pytest.mark.django_db
def test_invoice_service_create_sets_voucher_date_when_missing(tenant, admin_user):
    service = InvoiceService(tenant=tenant, user=admin_user)

    inv = service.create({
        'line_items': [],
        'discount': Decimal('0.00'),
        'status': Invoice.STATUS_DRAFT,
        'notes': 'date auto-populate test',
    })

    assert inv.date == timezone.localdate()


@pytest.mark.django_db
def test_invoice_service_generate_issued_sets_voucher_date_when_missing(tenant, admin_user):
    service = InvoiceService(tenant=tenant, user=admin_user)

    inv = service.generate_issued({
        'line_items': [],
        'discount': Decimal('0.00'),
        'notes': 'date auto-populate test (issued)',
    })

    assert inv.status == Invoice.STATUS_ISSUED
    assert inv.date == timezone.localdate()


@pytest.mark.django_db
def test_credit_note_fiscal_filter_prefers_issued_at_with_legacy_fallback(tenant, admin_user):
    target_date = datetime.date(2024, 10, 5)
    start = target_date - datetime.timedelta(days=2)
    end = target_date + datetime.timedelta(days=2)

    invoice = Invoice.objects.create(
        tenant=tenant,
        created_by=admin_user,
        date=target_date,
        line_items=[],
        subtotal=Decimal('100.00'),
        discount=Decimal('0.00'),
        vat_rate=Decimal('0.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('100.00'),
        status=Invoice.STATUS_DRAFT,
    )

    issued_cn = CreditNote.objects.create(
        tenant=tenant,
        created_by=admin_user,
        invoice=invoice,
        line_items=[],
        subtotal=Decimal('10.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('10.00'),
        status=CreditNote.STATUS_ISSUED,
        issued_at=timezone.make_aware(datetime.datetime(2024, 10, 5, 10, 0, 0)),
    )

    legacy_cn = CreditNote.objects.create(
        tenant=tenant,
        created_by=admin_user,
        invoice=invoice,
        line_items=[],
        subtotal=Decimal('5.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('5.00'),
        status=CreditNote.STATUS_DRAFT,
        issued_at=None,
    )
    CreditNote.objects.filter(pk=legacy_cn.pk).update(
        created_at=timezone.make_aware(datetime.datetime(2024, 10, 5, 9, 0, 0))
    )

    out_of_range_cn = CreditNote.objects.create(
        tenant=tenant,
        created_by=admin_user,
        invoice=invoice,
        line_items=[],
        subtotal=Decimal('3.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('3.00'),
        status=CreditNote.STATUS_ISSUED,
        issued_at=timezone.make_aware(datetime.datetime(2026, 1, 1, 9, 0, 0)),
    )

    qs = CreditNoteService(tenant=tenant, user=admin_user).list(
        fiscal_year_start=start,
        fiscal_year_end=end,
    )
    ids = set(qs.values_list('id', flat=True))

    assert issued_cn.id in ids
    assert legacy_cn.id in ids
    assert out_of_range_cn.id not in ids


@pytest.mark.django_db
def test_quotation_fiscal_filter_uses_accepted_sent_then_created_fallback(tenant, admin_user):
    target_date = datetime.date(2024, 11, 12)
    fy = str(fiscal_year_of(target_date).bs_year)

    # 1) Included by accepted_at
    q_accepted = Quotation.objects.create(
        tenant=tenant,
        created_by=admin_user,
        line_items=[],
        subtotal=Decimal('10.00'),
        discount=Decimal('0.00'),
        vat_rate=Decimal('0.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('10.00'),
        status=Quotation.STATUS_ACCEPTED,
        accepted_at=timezone.make_aware(datetime.datetime(2024, 11, 12, 12, 0, 0)),
    )

    # 2) Included by sent_at fallback (accepted_at is null)
    q_sent = Quotation.objects.create(
        tenant=tenant,
        created_by=admin_user,
        line_items=[],
        subtotal=Decimal('20.00'),
        discount=Decimal('0.00'),
        vat_rate=Decimal('0.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('20.00'),
        status=Quotation.STATUS_SENT,
        sent_at=timezone.make_aware(datetime.datetime(2024, 11, 12, 9, 0, 0)),
    )

    # 3) Included by created_at fallback (accepted_at and sent_at are null)
    q_created = Quotation.objects.create(
        tenant=tenant,
        created_by=admin_user,
        line_items=[],
        subtotal=Decimal('30.00'),
        discount=Decimal('0.00'),
        vat_rate=Decimal('0.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('30.00'),
        status=Quotation.STATUS_DRAFT,
    )
    Quotation.objects.filter(pk=q_created.pk).update(
        created_at=timezone.make_aware(datetime.datetime(2024, 11, 12, 8, 0, 0))
    )

    # 4) Out of range
    q_out = Quotation.objects.create(
        tenant=tenant,
        created_by=admin_user,
        line_items=[],
        subtotal=Decimal('40.00'),
        discount=Decimal('0.00'),
        vat_rate=Decimal('0.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('40.00'),
        status=Quotation.STATUS_ACCEPTED,
        accepted_at=timezone.make_aware(datetime.datetime(2026, 1, 1, 10, 0, 0)),
    )

    view = _build_view(QuotationViewSet, tenant=tenant, user=admin_user, params={'fiscal_year': fy})
    qs = view.get_queryset()
    ids = set(qs.values_list('id', flat=True))

    assert q_accepted.id in ids
    assert q_sent.id in ids
    assert q_created.id in ids
    assert q_out.id not in ids


@pytest.mark.django_db
def test_debit_note_fiscal_filter_uses_issued_at_with_created_fallback(tenant, admin_user):
    target_date = datetime.date(2024, 9, 15)
    fy = str(fiscal_year_of(target_date).bs_year)

    bill = Bill.objects.create(
        tenant=tenant,
        created_by=admin_user,
        supplier_name='Supplier A',
        date=target_date,
        line_items=[],
        subtotal=Decimal('80.00'),
        discount=Decimal('0.00'),
        vat_rate=Decimal('0.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('80.00'),
        status=Bill.STATUS_DRAFT,
    )

    dn_issued = DebitNote.objects.create(
        tenant=tenant,
        created_by=admin_user,
        bill=bill,
        line_items=[],
        subtotal=Decimal('8.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('8.00'),
        status=DebitNote.STATUS_ISSUED,
        issued_at=timezone.make_aware(datetime.datetime(2024, 9, 15, 10, 0, 0)),
    )

    dn_legacy = DebitNote.objects.create(
        tenant=tenant,
        created_by=admin_user,
        bill=bill,
        line_items=[],
        subtotal=Decimal('5.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('5.00'),
        status=DebitNote.STATUS_DRAFT,
        issued_at=None,
    )
    DebitNote.objects.filter(pk=dn_legacy.pk).update(
        created_at=timezone.make_aware(datetime.datetime(2024, 9, 15, 8, 0, 0))
    )

    dn_out = DebitNote.objects.create(
        tenant=tenant,
        created_by=admin_user,
        bill=bill,
        line_items=[],
        subtotal=Decimal('6.00'),
        vat_amount=Decimal('0.00'),
        total=Decimal('6.00'),
        status=DebitNote.STATUS_ISSUED,
        issued_at=timezone.make_aware(datetime.datetime(2026, 1, 1, 10, 0, 0)),
    )

    view = _build_view(DebitNoteViewSet, tenant=tenant, user=admin_user, params={'fiscal_year': fy})
    qs = view.get_queryset()
    ids = set(qs.values_list('id', flat=True))

    assert dn_issued.id in ids
    assert dn_legacy.id in ids
    assert dn_out.id not in ids
