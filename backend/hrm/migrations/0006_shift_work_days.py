from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hrm', '0005_add_created_by_to_shift'),
    ]

    operations = [
        migrations.AddField(
            model_name='shift',
            name='work_days',
            field=models.JSONField(
                default=list,
                help_text=(
                    'Python weekday() integers that count as working days for this shift. '
                    'Mon=0 … Sun=6. Empty list = inherit from AttendancePolicy.'
                ),
            ),
        ),
    ]
