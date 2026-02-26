"""
Migration 0006 — Nepal hierarchical address + optional email

Changes:
  - Remove the flat `address` TextField
  - Add `province` (choice), `district`, `municipality`, `ward_no`, `street`
  - `email` was already blank=True in the model, no DB change needed for that
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0005_add_customer_number'),
    ]

    operations = [
        # Remove the old flat address field
        migrations.RemoveField(
            model_name='customer',
            name='address',
        ),

        # Province (one of Nepal's 7 official provinces)
        migrations.AddField(
            model_name='customer',
            name='province',
            field=models.CharField(
                max_length=32,
                blank=True,
                choices=[
                    ('koshi',         'Koshi'),
                    ('madhesh',       'Madhesh'),
                    ('bagmati',       'Bagmati'),
                    ('gandaki',       'Gandaki'),
                    ('lumbini',       'Lumbini'),
                    ('karnali',       'Karnali'),
                    ('sudurpashchim', 'Sudurpashchim'),
                ],
                help_text="One of Nepal's 7 provinces",
            ),
        ),

        # District (77 districts — free text, no constraint)
        migrations.AddField(
            model_name='customer',
            name='district',
            field=models.CharField(
                max_length=128,
                blank=True,
                help_text='e.g. Kathmandu',
            ),
        ),

        # Municipality / Sub-Metropolitan / Metropolitan / Rural Municipality
        migrations.AddField(
            model_name='customer',
            name='municipality',
            field=models.CharField(
                max_length=255,
                blank=True,
                help_text='Municipality / Sub-Metropolitan / Metropolitan / Rural Municipality',
            ),
        ),

        # Ward number
        migrations.AddField(
            model_name='customer',
            name='ward_no',
            field=models.CharField(
                max_length=8,
                blank=True,
                help_text='Ward number',
            ),
        ),

        # Street / Tole / Landmark
        migrations.AddField(
            model_name='customer',
            name='street',
            field=models.CharField(
                max_length=255,
                blank=True,
                help_text='Tole / Street / Landmark',
            ),
        ),
    ]
