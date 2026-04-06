from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0037_cleanup_legacy_nepal_bank_demo_rows'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='tds_rate',
            field=models.DecimalField(
                decimal_places=4,
                default=0,
                help_text='Customer withholding TDS rate (e.g. 0.10 = 10%). Incoming receipts only.',
                max_digits=6,
            ),
        ),
        migrations.AddField(
            model_name='payment',
            name='tds_withheld_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Amount withheld by customer as TDS for this receipt.',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='payment',
            name='net_receipt_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Net cash received after TDS withholding.',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='payment',
            name='tds_reference',
            field=models.CharField(
                blank=True,
                help_text='Customer TDS reference (certificate/challan/reference number).',
                max_length=64,
            ),
        ),
    ]
