# Generated manually 2026-04-03
# Adds payment_account FK to Expense — Tally-style "Paid Via" account selection.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0024_po_bill_link'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='payment_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='expenses_paid_via',
                to='accounting.account',
                help_text=(
                    'Credit account used when posting to ledger. '
                    'Cash (1010) = paid from petty cash. '
                    'Bank = paid by bank transfer. '
                    'Staff Payable / liability = employee paid personally, company owes reimbursement.'
                ),
            ),
        ),
    ]
