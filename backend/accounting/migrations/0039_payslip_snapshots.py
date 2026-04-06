from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0038_payment_customer_tds_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='payslip',
            name='attendance_snapshot_json',
            field=models.JSONField(default=dict, help_text='Immutable attendance input snapshot captured at payroll generation.'),
        ),
        migrations.AddField(
            model_name='payslip',
            name='calculation_trace_json',
            field=models.JSONField(default=dict, help_text='Calculation trace and derived values captured at payroll generation.'),
        ),
        migrations.AddField(
            model_name='payslip',
            name='formula_version',
            field=models.CharField(default='v1', help_text='Payroll formula version used to compute this payslip.', max_length=32),
        ),
        migrations.AddField(
            model_name='payslip',
            name='leave_snapshot_json',
            field=models.JSONField(default=dict, help_text='Immutable leave input snapshot captured at payroll generation.'),
        ),
        migrations.AddField(
            model_name='payslip',
            name='salary_snapshot_json',
            field=models.JSONField(default=dict, help_text='Immutable salary input snapshot captured at payroll generation.'),
        ),
    ]
