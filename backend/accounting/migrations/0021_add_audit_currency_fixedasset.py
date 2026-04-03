"""
0021_add_audit_currency_fixedasset

B25 — JournalEntryAuditLog: immutable change log for journal entry mutations.
B20 — Currency + ExchangeRate: multi-currency foundation models.
B21 — FixedAsset: depreciation register (SLM + WDV).
B3  — UniqueConstraint on JournalEntry to prevent duplicate-posted entries.
B8  — JournalEntry.reference_type: add fiscal_year_close, depreciation,
      fx_gain_loss choices (already added in model; this migration adds the
      DB constraint change if any, and the new model tables).
"""

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0020_add_unique_constraints'),
        ('tenants', '__first__'),
    ]

    operations = [

        # ── B25: JournalEntryAuditLog ─────────────────────────────────────────
        migrations.CreateModel(
            name='JournalEntryAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entry_number', models.CharField(blank=True, db_index=True, help_text='Snapshot of entry_number at time of change (survives entry deletion).', max_length=32)),
                ('action', models.CharField(choices=[('create', 'Created'), ('update', 'Updated'), ('delete', 'Deleted')], max_length=8)),
                ('changed_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('reason', models.TextField(blank=True, help_text='Optional reason/note for the change.')),
                ('field_changes', models.JSONField(default=dict)),
                ('entry_snapshot', models.JSONField(default=dict)),
                ('changed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('journal_entry', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='accounting.journalentry')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='journal_audit_logs', to='tenants.tenant')),
            ],
            options={
                'ordering': ['-changed_at'],
            },
        ),
        migrations.AddIndex(
            model_name='journalentryauditlog',
            index=models.Index(fields=['tenant', 'changed_at'], name='acc_jaudit_tenant_date_idx'),
        ),
        migrations.AddIndex(
            model_name='journalentryauditlog',
            index=models.Index(fields=['journal_entry', 'changed_at'], name='acc_jaudit_entry_date_idx'),
        ),

        # ── B20: Currency ─────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Currency',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(db_index=True, default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('code', models.CharField(db_index=True, help_text='ISO 4217 code e.g. NPR, USD, EUR', max_length=3)),
                ('name', models.CharField(max_length=60)),
                ('symbol', models.CharField(blank=True, max_length=6)),
                ('is_base', models.BooleanField(default=False, help_text='True for the tenant base currency.')),
                ('is_active', models.BooleanField(default=True)),
                ('decimal_places', models.PositiveSmallIntegerField(default=2)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acc_currencies', to='tenants.tenant')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['code'],
            },
        ),
        migrations.AddConstraint(
            model_name='currency',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'code'],
                name='acc_currency_tenant_code_uniq',
            ),
        ),
        migrations.AddConstraint(
            model_name='currency',
            constraint=models.UniqueConstraint(
                fields=['tenant'],
                condition=models.Q(is_base=True),
                name='acc_currency_one_base_per_tenant',
            ),
        ),

        # ── B20: ExchangeRate ─────────────────────────────────────────────────
        migrations.CreateModel(
            name='ExchangeRate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(db_index=True, default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('rate', models.DecimalField(decimal_places=6, max_digits=18)),
                ('rate_date', models.DateField(db_index=True)),
                ('source', models.CharField(blank=True, help_text='Rate source: manual | NRB | ECB etc.', max_length=40)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acc_exchange_rates', to='tenants.tenant')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('from_currency', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='rates_from', to='accounting.currency')),
                ('to_currency', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='rates_to', to='accounting.currency')),
            ],
            options={
                'ordering': ['-rate_date'],
            },
        ),
        migrations.AddIndex(
            model_name='exchangerate',
            index=models.Index(fields=['tenant', 'from_currency', 'to_currency', 'rate_date'], name='acc_exrate_lookup_idx'),
        ),

        # ── B21: FixedAsset ───────────────────────────────────────────────────
        migrations.CreateModel(
            name='FixedAsset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(db_index=True, default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('name', models.CharField(max_length=200)),
                ('asset_code', models.CharField(blank=True, db_index=True, max_length=20)),
                ('purchase_date', models.DateField()),
                ('purchase_cost', models.DecimalField(decimal_places=2, max_digits=14)),
                ('residual_value', models.DecimalField(decimal_places=2, default=0, help_text='Estimated salvage value at end of useful life.', max_digits=14)),
                ('useful_life_months', models.PositiveIntegerField(default=60, help_text='Useful life in months (e.g. 60 = 5 years).')),
                ('depreciation_rate', models.DecimalField(blank=True, decimal_places=4, help_text='Annual rate for WDV method (e.g. 0.20 = 20%). Leave blank for SLM.', max_digits=6, null=True)),
                ('method', models.CharField(choices=[('slm', 'Straight-Line (SLM)'), ('wdv', 'Written-Down Value (WDV)')], default='slm', max_length=3)),
                ('status', models.CharField(choices=[('active', 'Active'), ('disposed', 'Disposed'), ('fully_depreciated', 'Fully Depreciated')], default='active', max_length=20)),
                ('last_depreciation_date', models.DateField(blank=True, help_text='Date of the most recent depreciation journal.', null=True)),
                ('total_depreciated', models.DecimalField(decimal_places=2, default=0, help_text='Running total of all depreciation posted for this asset.', max_digits=14)),
                ('notes', models.TextField(blank=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acc_fixed_assets', to='tenants.tenant')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('asset_account', models.ForeignKey(help_text='CoA account for the asset cost (must be in fixed_assets group).', on_delete=django.db.models.deletion.PROTECT, related_name='fixed_assets_asset', to='accounting.account')),
                ('accum_depr_account', models.ForeignKey(blank=True, help_text='Accumulated Depreciation account. Created if blank.', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='fixed_assets_accum', to='accounting.account')),
                ('depr_expense_account', models.ForeignKey(blank=True, help_text='Depreciation Expense account. Defaults to group indirect_expense.', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='fixed_assets_depr_exp', to='accounting.account')),
            ],
            options={
                'ordering': ['-purchase_date', 'name'],
            },
        ),
        migrations.AddConstraint(
            model_name='fixedasset',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'asset_code'],
                condition=models.Q(asset_code__gt=''),
                name='acc_fixedasset_tenant_code_uniq',
            ),
        ),

        # B3 constraint moved to 0022 (acc_journal_one_per_doc_purpose) with
        # purpose in fields — the 3-field version here was removed because live
        # data already had multiple posted entries per document under different
        # purposes (e.g. revenue + cogs for the same invoice), which violates
        # a 3-field constraint but is valid under the 4-field one.
    ]
