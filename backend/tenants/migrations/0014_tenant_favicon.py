from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0013_seed_cms_module'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='favicon',
            field=models.URLField(
                blank=True,
                help_text='URL of the tenant favicon (16×16 or 32×32 .ico/.png).',
            ),
        ),
    ]
