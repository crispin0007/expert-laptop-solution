"""
0041_add_cointransaction_source_unique

Enforce one CoinTransaction per tenant/source_type/source_id to prevent
duplicate ticket/task rewards from being counted multiple times.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0040_payslip_correction_revision'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='cointransaction',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'source_type', 'source_id'],
                name='acc_cointransaction_source_uniq',
            ),
        ),
    ]
