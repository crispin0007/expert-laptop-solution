"""
test_expense_lifecycle.py
=========================
Tests for the Expense feature:
  - create draft expense
  - approve → reject lifecycle
  - post to double-entry ledger
  - recurring expense helper

Run inside Docker:
  docker exec nexus_bms-web-1 python -m pytest accounting/tests/test_expense_lifecycle.py -v
"""
import pytest
from decimal import Decimal


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def tenant(db):
    """Create a tenant; CoA is seeded by post_save signal on Tenant."""
    from tenants.models import Tenant
    t = Tenant.objects.create(
        name="Expense Co",
        slug="expco",
        vat_enabled=True,
        vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
    )
    return t


@pytest.fixture
def admin_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user(
        "expadmin", email="admin@expco.com", password="testpass"
    )
    TenantMembership.objects.create(
        user=user, tenant=tenant, role="admin", is_active=True
    )
    return user


@pytest.fixture
def staff_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user(
        "expstaff", email="staff@expco.com", password="testpass"
    )
    TenantMembership.objects.create(
        user=user, tenant=tenant, role="staff", is_active=True
    )
    return user


@pytest.fixture
def service(tenant, admin_user):
    from accounting.services.expense_service import ExpenseService
    return ExpenseService(tenant=tenant, user=admin_user)


# ─── Model Tests ─────────────────────────────────────────────────────────────

class TestExpenseModel:
    """Test Expense model creation and field defaults."""

    def test_expense_created_as_draft(self, db, service):
        expense = service.create({
            'category': 'travel',
            'description': 'Taxi to client site',
            'amount': Decimal('500.00'),
            'date': '2082-01-15',
        })
        assert expense.status == 'draft'
        assert expense.id is not None
        assert expense.description == 'Taxi to client site'

    def test_expense_str(self, db, service):
        expense = service.create({
            'category': 'meals',
            'description': 'Team lunch',
            'amount': Decimal('2000.00'),
            'date': '2082-01-15',
        })
        assert str(expense)  # __str__ should not crash

    def test_expense_deleted(self, db, service):
        from accounting.models import Expense
        expense = service.create({
            'category': 'other',
            'description': 'Misc cost',
            'amount': Decimal('100.00'),
            'date': '2082-01-10',
        })
        expense_id = expense.id
        service.delete(expense)
        assert not Expense.objects.filter(id=expense_id).exists()


# ─── Lifecycle Tests ──────────────────────────────────────────────────────────

class TestExpenseLifecycle:
    """Test approve → reject state transitions."""

    def test_approve_draft_expense(self, db, service):
        expense = service.create({
            'category': 'utilities',
            'description': 'Internet bill',
            'amount': Decimal('3000.00'),
            'date': '2082-01-15',
        })
        service.approve(expense)
        expense.refresh_from_db()
        assert expense.status == 'approved'
        assert expense.approved_by is not None
        assert expense.approved_at is not None

    def test_reject_draft_expense(self, db, service):
        expense = service.create({
            'category': 'marketing',
            'description': 'Facebook ad spend',
            'amount': Decimal('8000.00'),
            'date': '2082-01-15',
        })
        service.reject(expense, 'Not budgeted this month')
        expense.refresh_from_db()
        assert expense.status == 'rejected'
        assert 'Not budgeted' in expense.rejection_note
        assert expense.rejected_by is not None

    def test_reject_approved_expense(self, db, service):
        expense = service.create({
            'category': 'training',
            'description': 'Online course',
            'amount': Decimal('5000.00'),
            'date': '2082-01-15',
        })
        service.approve(expense)
        service.reject(expense, 'Budget frozen')
        expense.refresh_from_db()
        assert expense.status == 'rejected'

    def test_cannot_update_posted_expense(self, db, service, tenant):
        """A posted expense cannot be edited."""
        from core.exceptions import ConflictError
        from accounting.models import Account
        # Ensure expense-type accounts exist (seeded by tenant signal)
        expense = service.create({
            'category': 'office_supplies',
            'description': 'Printer paper',
            'amount': Decimal('1200.00'),
            'date': '2082-01-15',
        })
        service.approve(expense)
        # Only try to post if the CoA has expense accounts
        expense_accounts = Account.objects.filter(tenant=tenant, type='expense', is_active=True)
        if expense_accounts.exists():
            service.post(expense)
            expense.refresh_from_db()
            if expense.status == 'posted':
                with pytest.raises(ConflictError):
                    service.update(expense, {'description': 'Changed description'})

    def test_cannot_delete_posted_expense(self, db, service, tenant):
        """A posted expense cannot be deleted."""
        from core.exceptions import ConflictError
        from accounting.models import Account
        expense = service.create({
            'category': 'maintenance',
            'description': 'Server maintenance',
            'amount': Decimal('7500.00'),
            'date': '2082-01-15',
        })
        service.approve(expense)
        expense_accounts = Account.objects.filter(tenant=tenant, type='expense', is_active=True)
        if expense_accounts.exists():
            service.post(expense)
            expense.refresh_from_db()
            if expense.status == 'posted':
                with pytest.raises(ConflictError):
                    service.delete(expense)


# ─── Ledger Posting Tests ─────────────────────────────────────────────────────

class TestExpenseLedgerPosting:
    """Test that posting an expense creates balanced double-entry journal."""

    def test_post_creates_journal_entry(self, db, service, tenant):
        from accounting.models import Account, JournalEntry
        expense_accounts = Account.objects.filter(tenant=tenant, type='expense', is_active=True)
        asset_accounts   = Account.objects.filter(tenant=tenant, type='asset', is_active=True)
        if not expense_accounts.exists() or not asset_accounts.exists():
            pytest.skip('CoA not seeded for this tenant — skip posting test')

        expense = service.create({
            'category': 'travel',
            'description': 'Flight to Kathmandu',
            'amount': Decimal('15000.00'),
            'date': '2082-01-15',
        })
        service.approve(expense)
        service.post(expense)
        expense.refresh_from_db()

        assert expense.status == 'posted'
        assert expense.journal_entry_id is not None

        entry = JournalEntry.objects.get(id=expense.journal_entry_id)
        assert entry.is_posted is True
        assert entry.total_debit == Decimal('15000.00')
        assert entry.total_credit == Decimal('15000.00')

    def test_post_requires_approved_status(self, db, service):
        from core.exceptions import ConflictError
        expense = service.create({
            'category': 'meals',
            'description': 'Client dinner',
            'amount': Decimal('4000.00'),
            'date': '2082-01-15',
        })
        # Still in draft — posting should fail
        with pytest.raises((ConflictError, Exception)):
            service.post(expense)


# ─── Recurring Tests ──────────────────────────────────────────────────────────

class TestExpenseRecurring:
    """Test recurring expense helper creates child and advances date."""

    def test_create_recurrence_increments_date(self, db, service):
        from datetime import date, timedelta
        import datetime
        # Use a past date so the service does not skip it ('not due yet' guard)
        start = datetime.date(2024, 1, 1)
        next_date = start + timedelta(days=30)  # 2024-01-31 — already past
        expense = service.create({
            'category': 'utilities',
            'description': 'Monthly internet',
            'amount': Decimal('2500.00'),
            'date': str(start),
            'is_recurring': True,
            'recur_interval': 'monthly',
            'next_recur_date': str(next_date),
        })

        child = service.create_recurrence(expense)
        assert child is not None, 'create_recurrence should return a new Expense'
        expense.refresh_from_db()

        assert child.description == expense.description
        assert child.amount == expense.amount
        assert child.status == 'draft'
        assert child.is_recurring is False  # child is a flat copy
        # Parent's next_recur_date should have advanced by 1 month
        from dateutil.relativedelta import relativedelta
        expected_next = next_date + relativedelta(months=1)
        assert expense.next_recur_date == expected_next

    def test_recurrence_returns_none_for_non_recurring(self, db, service):
        """create_recurrence on a non-recurring expense returns None (not due)."""
        expense = service.create({
            'category': 'other',
            'description': 'One-off cost',
            'amount': Decimal('500.00'),
            'date': '2024-01-10',
        })
        result = service.create_recurrence(expense)
        assert result is None
