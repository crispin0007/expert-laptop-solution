from django.db import migrations


def forwards(apps, schema_editor):
    BankAccount = apps.get_model('accounting', 'BankAccount')

    qs = BankAccount.objects.filter(
        linked_account__isnull=False,
        linked_account__group__slug='bank_accounts',
    ).exclude(linked_account__code='1150').select_related('linked_account')

    for bank in qs:
        target_name = (bank.bank_name or bank.name or '').strip()
        if not target_name:
            continue
        acct = bank.linked_account
        if acct.name != target_name:
            acct.name = target_name
            acct.save(update_fields=['name'])


def backwards(apps, schema_editor):
    # Keep renamed ledgers; rollback should not silently rewrite business labels.
    return


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0034_relink_bank_accounts_from_control'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
