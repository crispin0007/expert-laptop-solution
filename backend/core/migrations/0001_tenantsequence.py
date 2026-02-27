"""
Migration: Create core.TenantSequence

Depends on tenants app having its full schema in place before we reference
tenant IDs (the field is an int, not an FK, so no schema constraint —
but ordering ensures the tenants table is there first).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        # Pin to the latest known tenants migration so the tenants table
        # is guaranteed to exist before TenantSequence rows are created.
        ('tenants', '0008_alter_module_icon_alter_module_id_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='TenantSequence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenant_id', models.IntegerField(db_index=True)),
                ('key', models.CharField(max_length=64)),
                ('last_value', models.PositiveIntegerField(default=0)),
            ],
            options={
                'unique_together': {('tenant_id', 'key')},
            },
        ),
    ]
