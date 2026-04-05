from django.db import migrations
from django.db.models import Q


def forwards(apps, schema_editor):
    Account = apps.get_model('accounting', 'Account')
    BankAccount = apps.get_model('accounting', 'BankAccount')
    Payment = apps.get_model('accounting', 'Payment')
    BankReconciliation = apps.get_model('accounting', 'BankReconciliation')

    legacy_account_qs = Account.objects.filter(
        Q(code='1160') |
        Q(name__icontains='nepal bank limited') |
        Q(name='Bank Account (Demo)')
    )

    for account in legacy_account_qs.iterator():
        has_journal_lines = account.journal_lines.exists()
        has_children = account.children.exists()

        if has_journal_lines or has_children:
            update_fields = []
            if account.is_system:
                account.is_system = False
                update_fields.append('is_system')
            if account.is_active:
                account.is_active = False
                update_fields.append('is_active')
            if 'nepal bank limited' in (account.name or '').lower() or account.name == 'Bank Account (Demo)':
                account.name = 'Legacy Demo Bank Ledger'
                update_fields.append('name')
            if update_fields:
                account.save(update_fields=update_fields)
            continue

        linked_bank = BankAccount.objects.filter(linked_account_id=account.id).first()
        if linked_bank is not None:
            has_payments = Payment.objects.filter(bank_account_id=linked_bank.id).exists()
            has_reconciliations = BankReconciliation.objects.filter(bank_account_id=linked_bank.id).exists()
            if has_payments or has_reconciliations:
                linked_bank.is_active = False
                linked_bank.linked_account_id = None
                linked_bank.save(update_fields=['is_active', 'linked_account'])
            else:
                linked_bank.delete()

        account.delete()

    # Cleanup stray legacy bank profiles by name as well.
    legacy_bank_qs = BankAccount.objects.filter(
        Q(name__icontains='nepal bank limited') |
        Q(bank_name__icontains='nepal bank limited')
    )
    for bank in legacy_bank_qs.iterator():
        has_payments = Payment.objects.filter(bank_account_id=bank.id).exists()
        has_reconciliations = BankReconciliation.objects.filter(bank_account_id=bank.id).exists()
        if has_payments or has_reconciliations:
            if bank.is_active:
                bank.is_active = False
                bank.save(update_fields=['is_active'])
            continue
        bank.delete()


def backwards(apps, schema_editor):
    # Keep cleanup changes on rollback.
    return


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0036_normalize_demo_bank_account'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
