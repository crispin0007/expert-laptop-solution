"""
0022_journal_purpose_reversal_meta_drop_payment_received

B3  — JournalEntry.purpose: categorises why a journal was created (revenue,
      cogs, payslip, …). Included in the idempotency constraint so multiple
      purpose entries can coexist for the same document.

B5  — Reversal audit fields: reversal_reason, reversed_by_user FK,
      reversal_timestamp — record who voided an entry, why, and when.

B6  — Replace old 3-field UniqueConstraint (acc_journal_one_posted_per_doc)
      with 4-field version (acc_journal_one_per_doc_purpose) that includes
      purpose, allowing one revenue + one cogs entry per invoice.

B19 — Remove Invoice.payment_received boolean. Settlement is determined by
      `amount_due <= 0` (derived from payment allocations), making the flag
      redundant and a potential source of stale state.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0021_add_audit_currency_fixedasset'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [

        # ── B3: purpose field on JournalEntry ────────────────────────────────
        migrations.AddField(
            model_name='journalentry',
            name='purpose',
            field=models.CharField(
                blank=True,
                choices=[
                    ('revenue',      'Revenue'),
                    ('cogs',         'COGS'),
                    ('payslip',      'Payslip'),
                    ('vat',          'VAT Remittance'),
                    ('tds',          'TDS Remittance'),
                    ('payment',      'Payment'),
                    ('reversal',     'Reversal'),
                    ('recurring',    'Recurring'),
                    ('depreciation', 'Depreciation'),
                    ('fx_gain_loss', 'FX Gain/Loss'),
                    ('adjustment',   'Adjustment'),
                ],
                db_index=True,
                default='',
                help_text='Type of journal (revenue, cogs, payslip, …). Part of idempotency key.',
                max_length=20,
            ),
        ),

        # ── B5: Reversal audit fields ─────────────────────────────────────────
        migrations.AddField(
            model_name='journalentry',
            name='reversal_reason',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Reason provided when this entry was reversed/voided.',
            ),
        ),
        migrations.AddField(
            model_name='journalentry',
            name='reversed_by_user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='reversals_created',
                to=settings.AUTH_USER_MODEL,
                help_text='User who triggered the reversal.',
            ),
        ),
        migrations.AddField(
            model_name='journalentry',
            name='reversal_timestamp',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='UTC timestamp when the reversal was executed.',
            ),
        ),

        # ── B6 data-prep: disambiguate legacy entries created before purpose ──
        # All rows added before this migration have purpose=''. If two posted
        # entries exist for the same (tenant, reference_type, reference_id) with
        # purpose='' both, the constraint below would fail.  Label the extras
        # 'legacy_2', 'legacy_3', … so they become distinct.  The first row of
        # each duplicate group keeps purpose='' unchanged.
        migrations.RunSQL(
            sql="""
                UPDATE accounting_journalentry je
                SET purpose = 'legacy_' || subq.rn::text
                FROM (
                    SELECT id,
                           row_number() OVER (
                               PARTITION BY tenant_id, reference_type,
                                            reference_id, purpose
                               ORDER BY id
                           ) AS rn
                    FROM accounting_journalentry
                    WHERE is_posted       = true
                      AND reference_id   IS NOT NULL
                      AND purpose        = ''
                      AND reference_type NOT IN (
                          'manual', 'fiscal_year_close',
                          'vat_remittance', 'tds_remittance'
                      )
                ) subq
                WHERE je.id   = subq.id
                  AND subq.rn > 1;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # ── B6: Add 4-field idempotency constraint (includes purpose) ────────
        # The 3-field predecessor was never applied (removed from 0021 because
        # live data already had multiple entries per doc under different purposes).
        migrations.AddConstraint(
            model_name='journalentry',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'reference_type', 'reference_id', 'purpose'],
                condition=models.Q(
                    is_posted=True,
                    reference_id__isnull=False,
                ) & ~models.Q(
                    reference_type__in=[
                        'manual', 'fiscal_year_close',
                        'vat_remittance', 'tds_remittance',
                    ]
                ),
                name='acc_journal_one_per_doc_purpose',
            ),
        ),

        # ── B19: Remove Invoice.payment_received boolean ─────────────────────
        migrations.RemoveField(
            model_name='invoice',
            name='payment_received',
        ),
    ]
