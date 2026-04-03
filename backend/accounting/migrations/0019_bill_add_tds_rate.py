"""
Migration 0019 — Add tds_rate field to Bill.

Rationale: signals.handle_bill_tds uses getattr(instance, 'tds_rate', None)
but the field never existed, so TDS entries were silently skipped for ALL
supplier bills.  This adds the optional field so the accounting user can
specify a TDS rate when creating/editing a bill.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0018_add_performance_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='bill',
            name='tds_rate',
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text='TDS rate applied to this bill (e.g. 0.10 = 10%). '
                          'Leave blank if TDS does not apply.',
                max_digits=6,
                null=True,
            ),
        ),
    ]
