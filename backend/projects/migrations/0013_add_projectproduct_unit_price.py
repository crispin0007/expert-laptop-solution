# Generated manually to add unit_price to ProjectProduct

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0012_add_task_overdue_notified_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='projectproduct',
            name='unit_price',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
