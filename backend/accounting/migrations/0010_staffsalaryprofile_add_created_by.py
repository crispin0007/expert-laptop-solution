from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Patch migration: adds the missing `created_by` FK to StaffSalaryProfile.

    The field comes from TenantModel but was omitted from migration 0009.
    This migration is safe to run on both:
    - Dev: table exists without the column → column is added.
    - Production: after 0009 creates the table → column is added.
    """

    dependencies = [
        ('accounting', '0009_add_staffsalaryprofile_payslip_tds_payment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='staffsalaryprofile',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
