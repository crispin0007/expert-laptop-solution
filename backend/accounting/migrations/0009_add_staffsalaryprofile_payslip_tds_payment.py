from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0008_alter_journalentry_reference_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── StaffSalaryProfile ────────────────────────────────────────────────
        migrations.CreateModel(
            name='StaffSalaryProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='%(class)ss',
                    to='tenants.tenant',
                )),
                ('staff', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='salary_profiles',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('base_salary', models.DecimalField(
                    decimal_places=2, default=0, max_digits=14,
                    help_text='Monthly base salary in tenant currency',
                )),
                ('tds_rate', models.DecimalField(
                    decimal_places=4, default='0.1000', max_digits=6,
                    help_text='TDS rate e.g. 0.10 = 10%. Applied to base_salary.',
                )),
                ('bonus_default', models.DecimalField(
                    decimal_places=2, default=0, max_digits=14,
                    help_text='Default monthly bonus (can be overridden per payslip)',
                )),
                ('effective_from', models.DateField(
                    help_text='Salary effective from this date',
                )),
                ('notes', models.TextField(blank=True)),
            ],
            options={
                'verbose_name': 'Staff Salary Profile',
                'unique_together': {('tenant', 'staff')},
            },
        ),

        # ── Payslip: add tds_amount, payment_method, bank_account ─────────────
        migrations.AddField(
            model_name='payslip',
            name='tds_amount',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=14,
                help_text='Tax Deducted at Source computed from salary profile tds_rate',
            ),
        ),
        migrations.AddField(
            model_name='payslip',
            name='payment_method',
            field=models.CharField(
                blank=True, max_length=32,
                help_text='cash | bank_transfer | cheque',
            ),
        ),
        migrations.AddField(
            model_name='payslip',
            name='bank_account',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='payslip_payments',
                to='accounting.bankaccount',
                help_text='Bank account used when payment_method=bank_transfer',
            ),
        ),
    ]
