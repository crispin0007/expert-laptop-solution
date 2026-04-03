"""
Migration 0023 — Add deduction_breakdown JSONField to Payslip.

Enables per-line deduction accounts in create_payslip_journal():
  [{"label": "PF", "amount": "500.00", "account_code": "2310"}, ...]

Existing payslips get an empty list (default=list), which causes
create_payslip_journal() to fall back to the aggregate `deductions` field —
no behaviour change for existing data.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0022_journal_purpose_reversal_meta_drop_payment_received'),
    ]

    operations = [
        migrations.AddField(
            model_name='payslip',
            name='deduction_breakdown',
            field=models.JSONField(
                default=list,
                help_text=(
                    'Per-line deduction items: '
                    '[{"label": "PF", "amount": "500.00", "account_code": "2310"}, ...]. '
                    'account_code is optional; omit to default to Loans & Advances (1400). '
                    'sum(amounts) should equal the deductions field.'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='payslip',
            name='deductions',
            field=models.DecimalField(
                max_digits=14,
                decimal_places=2,
                default=0,
                help_text='Aggregate of all non-TDS deductions (sum of deduction_breakdown).',
            ),
        ),
    ]
