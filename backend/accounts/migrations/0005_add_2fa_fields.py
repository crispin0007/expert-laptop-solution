"""
Migration: add 2FA fields to accounts.User

Adds:
  - is_2fa_enabled (BooleanField, default=False)
  - totp_secret    (CharField max_length=64, blank=True)
  - backup_codes   (JSONField default=list)
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_add_staff_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_2fa_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='totp_secret',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='user',
            name='backup_codes',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
