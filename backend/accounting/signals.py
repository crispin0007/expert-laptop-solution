"""
Accounting signals.

Journal entries are auto-created here when model states change.
Never put journal logic in views or serializers — use journal_service.

Coin workflow (per business rules):
- Ticket closed → coins are NOT auto-created. Admin/manager manually awards
  coins via POST /tickets/{id}/close/ which creates an approved CoinTransaction.
- Ticket cancelled → pending CoinTransactions for that ticket are rejected.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

log = logging.getLogger(__name__)


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


# ─── Task done: coin creation is handled exclusively in projects.signals ─────
# projects.signals.handle_task_completed owns this responsibility.
# It uses _pre_status tracking to avoid double-fire and sets created_by correctly.


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
        except Exception as e:
            log.error("Invoice journal failed for invoice %s: %s", instance.pk, e, exc_info=True)

        # Post COGS journal for product lines (silently skipped if no product_id in line items)
        try:
            from accounting.services.journal_service import create_cogs_journal
            create_cogs_journal(instance, created_by=instance.created_by)
        except Exception as e:
            log.error("COGS journal failed for invoice %s: %s", instance.pk, e, exc_info=True)

    elif instance.status == 'void':
        # Only reverse if there was actually a posted invoice journal to undo.
        # A draft invoice that is voided directly (draft → void) never had a
        # journal entry, so creating a reversal would produce phantom credit entries.
        has_invoice_journal = JournalEntry.objects.filter(
            tenant=instance.tenant,
            reference_type='invoice',
            reference_id=instance.pk,
            is_posted=True,
        ).exists()
        if has_invoice_journal:
            try:
                reverse_invoice_journal(instance, created_by=instance.created_by)
            except Exception as e:
                log.error("Invoice void-journal failed for invoice %s: %s", instance.pk, e, exc_info=True)


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
        except Exception as e:
            log.error("Bill journal failed for bill %s: %s", instance.pk, e, exc_info=True)


# ─── Payment: journal on create ───────────────────────────────────────────────

@receiver(post_save, sender='accounting.Payment')
def handle_payment_created(sender, instance, created, **kwargs):
    """New payment → create cash movement journal entry.

    SKIP salary payments (reference='PAYSLIP-…'): those are journalised by
    handle_payslip_paid instead, with the correct gross-salary / TDS split.
    The Payment record is still created for cash-flow / bank-reconciliation
    purposes — we just don't want a duplicate (and incorrect) journal here.
    """
    if not created:
        return

    # Salary payments: journal is posted by handle_payslip_paid signal
    if (instance.reference or '').startswith('PAYSLIP-'):
        return

    # Credit note application: no cash changes hands — the credit note's own
    # journal (Dr Revenue / Cr AR) was posted by handle_credit_note_issued when
    # the credit note was issued.  Posting an additional Dr Cash / Cr AR here
    # would create a phantom cash receipt and double-clear the AR.
    if (instance.method or '') == 'credit_note':
        return

    from accounting.services.journal_service import create_payment_journal
    try:
        create_payment_journal(instance, created_by=instance.created_by)
    except Exception as e:
        log.error("Payment journal failed for payment %s: %s", instance.pk, e, exc_info=True)


# ─── Credit Note: journal on issue ───────────────────────────────────────────

@receiver(post_save, sender='accounting.CreditNote')
def handle_credit_note_issued(sender, instance, created, **kwargs):
    """Issued → create reversal journal entry.
    Void (after issued) → reverse the issued journal so books are restored.
    """
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import (
        create_credit_note_journal,
        reverse_credit_note_journal,
    )

    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='credit_note',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'issued' and not already_posted:
        try:
            create_credit_note_journal(instance, created_by=instance.created_by)
        except Exception as e:
            log.error("Credit note journal failed for CN %s: %s", instance.pk, e, exc_info=True)

    elif instance.status == 'void' and already_posted:
        # Only reverse if an issued journal was actually posted.
        # Voiding a draft CN (which was never issued) has no journal to reverse.
        # Guard: avoid double-reversals by checking reference_type’s entry count.
        void_already_reversed = JournalEntry.objects.filter(
            tenant=instance.tenant,
            reference_type='credit_note',
            reference_id=instance.pk,
            is_posted=True,
        ).count() >= 2   # 1 = original, 2+ = already has a reversal
        if not void_already_reversed:
            try:
                reverse_credit_note_journal(instance, created_by=instance.created_by)
            except Exception as e:
                log.error("Credit note void-reversal failed for CN %s: %s", instance.pk, e, exc_info=True)


# ─── Payslip: journal on paid ─────────────────────────────────────────────────

@receiver(post_save, sender='accounting.Payslip')
def handle_payslip_paid(sender, instance, created, **kwargs):
    """
    Paid → create salary expense journal entry with correct gross/TDS split:

      Dr  Salary Expense  5200   gross (net_pay + tds_amount)
      Cr  TDS Payable     2300   tds_amount   ← liability to IRD
      Cr  Cash / Bank            net_pay      ← actually paid to employee

    IMPORTANT: The Payment record created by mark_paid (reference='PAYSLIP-…')
    intentionally skips its own journal in handle_payment_created so that only
    THIS handler posts the double-entry.  Recording it here gives us the full
    gross-salary debit and the TDS liability credit — neither of which the
    Payment-side journal could supply.
    """
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
        except Exception as e:
            log.error("Payslip journal failed for payslip %s: %s", instance.pk, e, exc_info=True)


# ─── Tenant created: seed Chart of Accounts ──────────────────────────────────

@receiver(post_save, sender='tenants.Tenant')
def handle_tenant_created(sender, instance, created, **kwargs):
    """Seed the default Chart of Accounts for every new tenant."""
    if not created:
        return
    try:
        from accounting.services.journal_service import seed_chart_of_accounts
        seed_chart_of_accounts(instance)
    except Exception as e:
        log.error("CoA seed failed for tenant %s: %s", instance.slug, e, exc_info=True)


# ─── Debit Note: journal on issue ──────────────────────────────────────────────

@receiver(post_save, sender='accounting.DebitNote')
def handle_debit_note_issued(sender, instance, created, **kwargs):
    """
    Issued → reverse the AP and Expense journal entries from the original Bill.
    Creates: Dr AP / Cr Expense + Cr VAT Recoverable  (mirror of bill_journal).
    Void (after issued) → reverse the issued debit note journal.
    """
    if created:
        return

    from accounting.models import JournalEntry
    from accounting.services.journal_service import (
        create_debit_note_journal,
        reverse_debit_note_journal,
    )

    already_posted = JournalEntry.objects.filter(
        tenant=instance.tenant,
        reference_type='debit_note',
        reference_id=instance.pk,
        is_posted=True,
    ).exists()

    if instance.status == 'issued' and not already_posted:
        try:
            create_debit_note_journal(instance, created_by=instance.created_by)
        except Exception as e:
            log.error("Debit note journal failed for DN %s: %s", instance.pk, e, exc_info=True)

    elif instance.status == 'void' and already_posted:
        void_already_reversed = JournalEntry.objects.filter(
            tenant=instance.tenant,
            reference_type='debit_note',
            reference_id=instance.pk,
            is_posted=True,
        ).count() >= 2
        if not void_already_reversed:
            try:
                reverse_debit_note_journal(instance, created_by=instance.created_by)
            except Exception as e:
                log.error("Debit note void-reversal failed for DN %s: %s", instance.pk, e, exc_info=True)


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
    except Exception as e:
        log.error("Auto TDS entry failed for bill %s: %s", instance.pk, e, exc_info=True)
