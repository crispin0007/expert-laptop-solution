"""
accounting/migrations/0031_payslip_attendance_deduction.py

Adds attendance_deduction DecimalField to the Payslip model.
Stores the amount deducted for absent/late days per AttendancePolicy.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0030_expense_service_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='payslip',
            name='attendance_deduction',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=14,
                help_text='Amount deducted for absent/late days per AttendancePolicy.',
            ),
        ),
    ]
