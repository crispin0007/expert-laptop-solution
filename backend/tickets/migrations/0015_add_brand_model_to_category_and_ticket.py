from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0014_add_ticketproduct_serial_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticketcategory',
            name='has_brand_model',
            field=models.BooleanField(
                default=False,
                help_text='When enabled, tickets in this category will prompt for device brand and model.',
            ),
        ),
        migrations.AddField(
            model_name='ticket',
            name='device_brand',
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name='ticket',
            name='device_model',
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
