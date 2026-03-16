from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0006_indexes_and_seq'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='warranty_months',
            field=models.PositiveIntegerField(
                null=True,
                blank=True,
                help_text='Default warranty duration in months (e.g. 12 = 1 year)',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='warranty_description',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Warranty terms, conditions, or coverage details',
            ),
            preserve_default=False,
        ),
    ]
