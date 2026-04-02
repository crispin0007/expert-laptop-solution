"""
accounting/services/expense_service.py

Business logic for operational Expense lifecycle:
  draft → approved → posted (to ledger)
         └ rejected

Distinct from Bill (supplier invoice). Use this for internal expenses:
travel, office supplies, utilities, meal allowances, etc.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.exceptions import ValidationError, ConflictError, NotFoundError

logger = logging.getLogger(__name__)


class ExpenseService:
    """Business logic for internal Expense lifecycle."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(self, status=None, category=None, date_from=None, date_to=None):
        """Return filtered queryset of expenses for this tenant."""
        from accounting.models import Expense
        qs = (
            Expense.objects.filter(tenant=self.tenant)
            .select_related('submitted_by', 'approved_by', 'account')
            .order_by('-date', '-created_at')
        )
        if status:
            qs = qs.filter(status=status)
        if category:
            qs = qs.filter(category=category)
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs

    def get(self, pk: int):
        """Fetch single expense scoped to tenant."""
        from accounting.models import Expense
        try:
            return Expense.objects.select_related(
                'submitted_by', 'approved_by', 'rejected_by', 'account', 'journal_entry'
            ).get(pk=pk, tenant=self.tenant)
        except Expense.DoesNotExist:
            raise NotFoundError(f'Expense {pk} not found.')

    # ── Create ────────────────────────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        """Create a new draft expense."""
        from accounting.models import Expense
        expense = Expense.objects.create(
            tenant=self.tenant,
            submitted_by=self.user,
            created_by=self.user,
            status=Expense.STATUS_DRAFT,
            **validated_data,
        )
        logger.info('Expense created id=%s tenant=%s', expense.pk, self.tenant.slug)
        return expense

    # ── Update ────────────────────────────────────────────────────────────────

    @transaction.atomic
    def update(self, expense, validated_data: dict):
        """Update a draft expense. Cannot update once approved/posted."""
        if expense.status not in (expense.STATUS_DRAFT, expense.STATUS_REJECTED):
            raise ConflictError('Only draft or rejected expenses can be edited.')
        for field, value in validated_data.items():
            setattr(expense, field, value)
        expense.status = expense.STATUS_DRAFT  # reset rejected → draft on edit
        expense.save()
        return expense

    # ── Delete ────────────────────────────────────────────────────────────────

    @transaction.atomic
    def delete(self, expense):
        """Delete a draft expense. Cannot delete posted expenses."""
        if expense.status == expense.STATUS_POSTED:
            raise ConflictError('Posted expenses cannot be deleted. Void the journal entry instead.')
        expense.delete()

    # ── Approve ───────────────────────────────────────────────────────────────

    @transaction.atomic
    def approve(self, expense):
        """Approve a draft expense — sets status to approved, records approver."""
        if expense.status != expense.STATUS_DRAFT:
            raise ConflictError(f'Expense is {expense.status}, cannot approve.')
        expense.status = expense.STATUS_APPROVED
        expense.approved_by = self.user
        expense.approved_at = timezone.now()
        expense.save(update_fields=['status', 'approved_by', 'approved_at'])
        logger.info('Expense approved id=%s by user=%s', expense.pk, self.user)
        try:
            from core.events import EventBus
            EventBus.publish('expense.approved', {
                'id': expense.pk,
                'tenant_id': self.tenant.id,
                'amount': str(expense.amount),
            }, tenant=self.tenant)
        except Exception:
            pass
        return expense

    # ── Reject ────────────────────────────────────────────────────────────────

    @transaction.atomic
    def reject(self, expense, note: str = ''):
        """Reject an expense — returns it to draft with a rejection note."""
        if expense.status not in (expense.STATUS_DRAFT, expense.STATUS_APPROVED):
            raise ConflictError(f'Expense is {expense.status}, cannot reject.')
        expense.status = expense.STATUS_REJECTED
        expense.rejected_by = self.user
        expense.rejected_at = timezone.now()
        expense.rejection_note = note
        expense.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_note'])
        return expense

    # ── Post to Ledger ────────────────────────────────────────────────────────

    @transaction.atomic
    def post(self, expense):
        """
        Post an approved expense to the double-entry ledger.

        Creates JournalEntry:
          Dr  Expense Account (or default COGS/Expense account from CoA)
          Cr  Cash / Accounts Payable

        Sets expense.status = 'posted' and links the JournalEntry.
        """
        from accounting.models import JournalEntry, JournalLine, Account

        if expense.status != expense.STATUS_APPROVED:
            raise ConflictError('Only approved expenses can be posted to ledger.')
        if expense.journal_entry_id:
            raise ConflictError('Expense already posted.')

        # Resolve debit account (linked or default expense account)
        debit_account = expense.account
        if not debit_account:
            # Fall back to first expense-type account in CoA
            debit_account = (
                Account.objects.filter(tenant=self.tenant, type='expense', is_active=True)
                .order_by('code')
                .first()
            )
        if not debit_account:
            raise ValidationError(
                'No expense account configured. Set up your Chart of Accounts first.'
            )

        # Resolve credit account (Cash or default AP)
        credit_account = (
            Account.objects.filter(
                tenant=self.tenant, type='asset', is_active=True, code='1010'  # Cash
            ).first()
            or Account.objects.filter(
                tenant=self.tenant, type='asset', is_active=True
            ).order_by('code').first()
        )
        if not credit_account:
            raise ValidationError('No cash/asset account found in Chart of Accounts.')

        entry = JournalEntry.objects.create(
            tenant=self.tenant,
            date=expense.date,
            description=f'Expense: {expense.description}',
            reference_type=JournalEntry.REF_MANUAL,
            reference_id=expense.pk,
            created_by=self.user,
        )
        JournalLine.objects.create(entry=entry, account=debit_account,
                                   debit=expense.amount, credit=Decimal('0'),
                                   description=expense.description)
        JournalLine.objects.create(entry=entry, account=credit_account,
                                   debit=Decimal('0'), credit=expense.amount,
                                   description=expense.description)
        entry.post()

        expense.status = expense.STATUS_POSTED
        expense.journal_entry = entry
        expense.save(update_fields=['status', 'journal_entry'])
        logger.info('Expense posted id=%s journal=%s', expense.pk, entry.entry_number)
        return expense

    # ── Recurring ─────────────────────────────────────────────────────────────

    @transaction.atomic
    def create_recurrence(self, expense):
        """
        Create the next occurrence from a recurring expense template.
        Called by Celery Beat task `task_process_recurring_expenses`.
        """
        from accounting.models import Expense
        from dateutil.relativedelta import relativedelta

        if not expense.is_recurring or not expense.next_recur_date:
            return None

        from datetime import date, datetime
        # next_recur_date may be a str when the model instance was just created
        next_date = expense.next_recur_date
        if isinstance(next_date, str):
            next_date = datetime.strptime(next_date, '%Y-%m-%d').date()
        if next_date > date.today():
            return None  # not due yet

        # Build next date
        interval_map = {
            'weekly':  relativedelta(weeks=1),
            'monthly': relativedelta(months=1),
            'yearly':  relativedelta(years=1),
        }
        delta = interval_map.get(expense.recur_interval)
        if not delta:
            return None

        new_expense = Expense.objects.create(
            tenant=self.tenant,
            submitted_by=expense.submitted_by,
            created_by=expense.submitted_by,
            category=expense.category,
            description=expense.description,
            amount=expense.amount,
            date=next_date,
            account=expense.account,
            notes=f'Auto-generated from recurring expense #{expense.pk}',
            is_recurring=False,  # child is not itself recurring
            status=Expense.STATUS_DRAFT,
        )

        expense.next_recur_date = next_date + delta
        expense.save(update_fields=['next_recur_date'])
        logger.info(
            'Recurring expense created id=%s from template=%s', new_expense.pk, expense.pk
        )
        return new_expense
