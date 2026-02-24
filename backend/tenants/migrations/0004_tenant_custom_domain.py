from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0003_tenant_coin_to_money_rate_tenant_currency_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='custom_domain',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Custom domain for this tenant, e.g. crm.els.com. Leave blank to use subdomain.',
                max_length=255,
            ),
        ),
    ]
