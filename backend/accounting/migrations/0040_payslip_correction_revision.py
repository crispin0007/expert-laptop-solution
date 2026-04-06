from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0039_payslip_snapshots'),
    ]

    operations = [
        migrations.AddField(
            model_name='payslip',
            name='revision',
            field=models.PositiveIntegerField(default=1, help_text='Monotonic revision number for correction cycles. 1 = original issue.'),
        ),
        migrations.AddField(
            model_name='payslip',
            name='supersedes',
            field=models.ForeignKey(blank=True, help_text='Original payslip this correction supersedes, if any.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='corrections', to='accounting.payslip'),
        ),
        migrations.AddField(
            model_name='payslip',
            name='void_reason',
            field=models.TextField(blank=True, help_text='Reason captured when this payslip is reversed/voided.'),
        ),
        migrations.AddField(
            model_name='payslip',
            name='voided_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='payslip',
            name='status',
            field=models.CharField(choices=[('draft', 'Draft'), ('issued', 'Issued'), ('paid', 'Paid'), ('void', 'Void')], default='draft', max_length=16),
        ),
        migrations.AlterUniqueTogether(
            name='payslip',
            unique_together={('tenant', 'staff', 'period_start', 'period_end', 'revision')},
        ),
    ]
