"""
0003 — Ensure all optional/boolean columns have proper DB-level defaults.
The Sprint 2 migration added several columns as NOT NULL but without column-level
defaults, causing IntegrityError on INSERT when values are not explicitly supplied.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0002_sprint2_fields'),
    ]

    operations = [
        # Set empty-string defaults for all blank text fields
        migrations.RunSQL(
            sql="""
                ALTER TABLE customers_customer ALTER COLUMN email      SET DEFAULT '';
                ALTER TABLE customers_customer ALTER COLUMN phone      SET DEFAULT '';
                ALTER TABLE customers_customer ALTER COLUMN address    SET DEFAULT '';
                ALTER TABLE customers_customer ALTER COLUMN vat_number SET DEFAULT '';
                ALTER TABLE customers_customer ALTER COLUMN pan_number SET DEFAULT '';
                ALTER TABLE customers_customer ALTER COLUMN notes      SET DEFAULT '';
                ALTER TABLE customers_customer ALTER COLUMN is_deleted SET DEFAULT FALSE;
                ALTER TABLE customers_customer ALTER COLUMN is_active  SET DEFAULT TRUE;
                UPDATE customers_customer SET is_active  = TRUE  WHERE is_active  IS NULL;
                UPDATE customers_customer SET is_deleted = FALSE WHERE is_deleted IS NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
        # Re-declare fields so Django's migration state matches the DB
        migrations.AlterField(
            model_name='customer',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name='customer',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='customer',
            name='pan_number',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AlterField(
            model_name='customer',
            name='vat_number',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]
