from django.db import migrations


def _next_bank_code(Account, tenant_id):
    existing = set(
        Account.objects.filter(tenant_id=tenant_id, code__regex=r'^11[5-9]\d$')
        .values_list('code', flat=True)
    )
    for n in range(1151, 1200):
        code = str(n)
        if code not in existing:
            return code
    return None


def forwards(apps, schema_editor):
    Account = apps.get_model('accounting', 'Account')
    BankAccount = apps.get_model('accounting', 'BankAccount')
    AccountGroup = apps.get_model('accounting', 'AccountGroup')

    affected = BankAccount.objects.filter(linked_account__code='1150').select_related('linked_account')

    for bank in affected:
        tenant_id = bank.tenant_id
        control = Account.objects.filter(tenant_id=tenant_id, code='1150').first()
        if control is None:
            continue

        group = AccountGroup.objects.filter(tenant_id=tenant_id, slug='bank_accounts').first()

        # Reuse an existing child ledger if one already matches by name.
        existing_child = Account.objects.filter(
            tenant_id=tenant_id,
            name=bank.name,
            parent=control,
        ).exclude(code='1150').first()

        if existing_child is None:
            code = _next_bank_code(Account, tenant_id)
            if code is None:
                continue
            existing_child = Account.objects.create(
                tenant_id=tenant_id,
                created_by_id=bank.created_by_id,
                code=code,
                name=bank.name,
                type='asset',
                group=group,
                parent=control,
                description=f'Bank account: {bank.bank_name or bank.name}',
                opening_balance=bank.opening_balance,
                is_system=False,
                is_active=True,
            )

        bank.linked_account = existing_child
        bank.save(update_fields=['linked_account'])


def backwards(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0033_bank_accounts_hierarchy'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
