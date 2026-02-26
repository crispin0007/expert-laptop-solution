"""
Accounting signals.

Journal entries are auto-created here when model states change.
Never put journal logic in views or serializers — use journal_service.

Coin workflow (per business rules):
- Ticket closed → coins are NOT auto-created. Admin/manager manually awards
  coins via POST /tickets/{id}/close/ which creates an approved CoinTransaction.
- Ticket cancelled → pending CoinTransactions for that ticket are rejected.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver


# ─── Ticket: coin rejection on cancel ────────────────────────────────────────

@receiver(post_save, sender='tickets.Ticket')
def handle_ticket_cancelled(sender, instance, created, **kwargs):
    """When a ticket is cancelled, reject pending coin transactions."""
    if created:
        return

    from tickets.models import Ticket
    from accounting.models import CoinTransaction

    if instance.status == Ticket.STATUS_CANCELLED:
        CoinTransaction.objects.filter(
            tenant=instance.tenant,
            source_type=CoinTransaction.SOURCE_TICKET,
            source_id=instance.pk,
            status=CoinTransaction.STATUS_PENDING,
        ).update(status=CoinTransaction.STATUS_REJECTED)


# ─── Task done: award pending coins ──────────────────────────────────────────

@receiver(post_save, sender='projects.ProjectTask')
def handle_task_done(sender, instance, created, **kwargs):
    """On task done, award pending coins to assigned staff."""
    if created or not instance.assigned_to_id:
        return

    from accounting.models import CoinTransaction

    if instance.status == 'done':
        already_exists = CoinTransaction.objects.filter(
            tenant=instance.tenant,
            source_type=CoinTransaction.SOURCE_TASK,
            source_id=instance.pk,
        ).exists()
        if not already_exists:
            CoinTransaction.objects.create(
                tenant=instance.tenant,
                created_by=instance.assigned_to,
                staff=instance.assigned_to,
                amount=1,
                source_type=CoinTransaction.SOURCE_TASK,
                source_id=instance.pk,
                status=CoinTransaction.STATUS_PENDING,
            )


# ─── Invoice: journal on issue / void ────────────────────────────────────────

@receiver(post_save, sender='accounting.Invoice')
def handle_invoice_status_change(sender, instance, created, **kwargs):
    """
    Issued → create Dr AR / Cr Revenue + VAT Payable journal entry.
    Void   → create reversal entry.
    """
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import create_invoice_journal, reverse_invoice_journal

    # Guard: only act on status transitions, skip if already has a posted journal
    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='invoice',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'issued' and not already_posted:
        try:
            create_invoice_journal(instance, created_by=instance.created_by)
        except Exception:
            pass   # missing accounts (e.g. fresh tenant without seeds) — silently skip

    elif instance.status == 'void':
        # Create reversal for every posted invoice journal
        try:
            reverse_invoice_journal(instance, created_by=instance.created_by)
        except Exception:
            pass


# ─── Bill: journal on approve ─────────────────────────────────────────────────

@receiver(post_save, sender='accounting.Bill')
def handle_bill_status_change(sender, instance, created, **kwargs):
    """Approved → create Dr Expense / Cr AP + VAT journal entry."""
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import create_bill_journal

    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='bill',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'approved' and not already_posted:
        try:
            create_bill_journal(instance, created_by=instance.created_by)
        except Exception:
            pass


# ─── Payment: journal on create ───────────────────────────────────────────────

@receiver(post_save, sender='accounting.Payment')
def handle_payment_created(sender, instance, created, **kwargs):
    """New payment → create cash movement journal entry."""
    if not created:
        return

    from accounting.services.journal_service import create_payment_journal
    try:
        create_payment_journal(instance, created_by=instance.created_by)
    except Exception:
        pass


# ─── Credit Note: journal on issue ───────────────────────────────────────────

@receiver(post_save, sender='accounting.CreditNote')
def handle_credit_note_issued(sender, instance, created, **kwargs):
    """Issued → create reversal journal entry."""
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import create_credit_note_journal

    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='credit_note',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'issued' and not already_posted:
        try:
            create_credit_note_journal(instance, created_by=instance.created_by)
        except Exception:
            pass


# ─── Payslip: journal on paid ─────────────────────────────────────────────────

@receiver(post_save, sender='accounting.Payslip')
def handle_payslip_paid(sender, instance, created, **kwargs):
    """Paid → create salary expense journal entry."""
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import create_payslip_journal

    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='payslip',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'paid' and not already_posted:
        try:
            create_payslip_journal(instance, created_by=instance.created_by)
        except Exception:
            pass


# ─── Tenant created: seed Chart of Accounts ──────────────────────────────────

@receiver(post_save, sender='tenants.Tenant')
def handle_tenant_created(sender, instance, created, **kwargs):
    """Seed the default Chart of Accounts for every new tenant."""
    if not created:
        return
    try:
        from accounting.services.journal_service import seed_chart_of_accounts
        seed_chart_of_accounts(instance)
    except Exception:
        pass


# ─── Debit Note: journal on issue ──────────────────────────────────────────────

@receiver(post_save, sender='accounting.DebitNote')
def handle_debit_note_issued(sender, instance, created, **kwargs):
    """
    Issued → reverse the AP and Expense journal entries from the original Bill.
    Creates: Dr AP / Cr Expense + Cr VAT Recoverable  (mirror of bill_journal).
    """
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import create_debit_note_journal

    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='debit_note',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'issued' and not already_posted:
        try:
            create_debit_note_journal(instance, created_by=instance.created_by)
        except Exception:
            pass


# ─── Bill approved: auto-create TDS entry if applicable ──────────────────────────

@receiver(post_save, sender='accounting.Bill')
def handle_bill_tds(sender, instance, created, **kwargs):
    """
    When a bill moves to approved and the supplier has TDS enabled (tracked via
    a `tds_rate` field on the bill), auto-create a TDSEntry so the tenant
    remembers to deposit it to IRD.
    This hook is intentionally lightweight — TDSEntry creation is idempotent.
    """
    if created or instance.status != 'approved':
        return

    # Only act if the bill carries TDS metadata
    tds_rate = getattr(instance, 'tds_rate', None)
    if not tds_rate:
        return

    from accounting.models import TDSEntry
    from django.utils import timezone

    already = TDSEntry.objects.filter(
        tenant=instance.tenant,
        bill=instance,
    ).exists()
    if already:
        return

    now = timezone.localdate()
    try:
        TDSEntry.objects.create(
            tenant=instance.tenant,
            created_by=instance.created_by,
            bill=instance,
            supplier_name=instance.supplier_name or (
                instance.supplier.name if instance.supplier else ''
            ),
            taxable_amount=instance.subtotal,
            tds_rate=tds_rate,
            period_month=now.month,
            period_year=now.year,
        )
    except Exception:
        pass
