from django.db import migrations


def forwards(apps, schema_editor):
    Account = apps.get_model('accounting', 'Account')
    AccountGroup = apps.get_model('accounting', 'AccountGroup')

    tenant_ids = set(Account.objects.values_list('tenant_id', flat=True))

    for tenant_id in tenant_ids:
        if tenant_id is None:
            continue

        assets_parent = Account.objects.filter(tenant_id=tenant_id, code='1000').first()
        bank_group = AccountGroup.objects.filter(tenant_id=tenant_id, slug='bank_accounts').first()

        control, _ = Account.objects.get_or_create(
            tenant_id=tenant_id,
            code='1150',
            defaults={
                'name': 'Bank Accounts',
                'type': 'asset',
                'parent': assets_parent,
                'group': bank_group,
                'is_system': True,
            },
        )

        changed = False
        if control.parent_id != getattr(assets_parent, 'id', None):
            control.parent = assets_parent
            changed = True
        if bank_group is not None and control.group_id != bank_group.id:
            control.group = bank_group
            changed = True
        if control.type != 'asset':
            control.type = 'asset'
            changed = True
        if control.name != 'Bank Accounts':
            control.name = 'Bank Accounts'
            changed = True
        if not control.is_system:
            control.is_system = True
            changed = True
        if changed:
            control.save()

        bank_ledgers = Account.objects.filter(
            tenant_id=tenant_id,
            group__slug='bank_accounts',
        ).exclude(code='1150')

        for ledger in bank_ledgers:
            if ledger.parent_id != control.id:
                ledger.parent = control
                ledger.save(update_fields=['parent'])


def backwards(apps, schema_editor):
    # Keep hierarchy changes on rollback to avoid destructive data moves.
    return


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0032_add_party_links'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
