"""
0018_add_performance_indexes.py
================================
Composite indexes for the most common query patterns in list views and reports.
These eliminate sequential scans on large tenant data sets.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0017_add_voucher_date_to_invoice_bill_account_to_payment'),
    ]

    operations = [
        # ── JournalEntry ──────────────────────────────────────────────────
        # report_service: every report filters entry__tenant + entry__date
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(
                fields=['tenant', 'date'],
                name='acc_je_tenant_date',
            ),
        ),
        # day_book / general_ledger: filter by reference_type + reference_id
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(
                fields=['tenant', 'reference_type', 'reference_id'],
                name='acc_je_tenant_ref',
            ),
        ),
        # All reports skip unposted entries
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(
                fields=['tenant', 'is_posted'],
                name='acc_je_tenant_posted',
            ),
        ),
        # ── Invoice ───────────────────────────────────────────────────────
        # List views filter by (tenant, status) constantly
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(
                fields=['tenant', 'status'],
                name='acc_inv_tenant_status',
            ),
        ),
        # VAT report + fiscal year filter on invoice date
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(
                fields=['tenant', 'date'],
                name='acc_inv_tenant_date',
            ),
        ),
        # Aged AR: filter overdue by due_date
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(
                fields=['tenant', 'due_date'],
                name='acc_inv_tenant_due_date',
            ),
        ),
        # ── Bill ──────────────────────────────────────────────────────────
        migrations.AddIndex(
            model_name='bill',
            index=models.Index(
                fields=['tenant', 'status'],
                name='acc_bill_tenant_status',
            ),
        ),
        # VAT report + fiscal year filter on bill date
        migrations.AddIndex(
            model_name='bill',
            index=models.Index(
                fields=['tenant', 'date'],
                name='acc_bill_tenant_date',
            ),
        ),
        # ── Payment ───────────────────────────────────────────────────────
        # cash_book / day_book filter by (tenant, date)
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(
                fields=['tenant', 'date'],
                name='acc_pay_tenant_date',
            ),
        ),
        # payment register filter by type (incoming / outgoing)
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(
                fields=['tenant', 'type'],
                name='acc_pay_tenant_type',
            ),
        ),
    ]
