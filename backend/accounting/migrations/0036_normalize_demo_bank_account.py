from django.db import migrations


def forwards(apps, schema_editor):
    Account = apps.get_model('accounting', 'Account')

    # Historical demo seed created a tenant-specific bank account as system.
    # Normalize those rows so tenants can manage them like regular bank ledgers.
    qs = Account.objects.filter(code='1160', is_system=True)
    for account in qs.iterator():
        changed = False
        if account.is_system:
            account.is_system = False
            changed = True
        if account.name == 'Bank — Nepal Bank Limited':
            account.name = 'Bank Account (Demo)'
            changed = True
        if changed:
            account.save(update_fields=['is_system', 'name'])


def backwards(apps, schema_editor):
    # Keep normalized data on rollback.
    return


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0035_sync_bank_ledger_names'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
