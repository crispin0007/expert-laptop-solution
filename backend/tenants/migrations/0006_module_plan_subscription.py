"""
Migration 0006 — Subscription Plans + Module catalogue

Adds:
  - Module table (seeded in 0007)
  - Plan table with M2M to Module
  - TenantModuleOverride table
  - Renames Tenant.plan (CharField) → Tenant.plan_str    (preserves existing data)
  - Adds    Tenant.plan (FK → Plan, nullable)             (populated in 0007)
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0005_alter_tenant_custom_domain_alter_tenant_slug'),
    ]

    operations = [
        # ── 1. Module catalogue ───────────────────────────────────────────────
        migrations.CreateModel(
            name='Module',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ('key', models.SlugField(max_length=64, unique=True, help_text='Machine key, e.g. "tickets"')),
                ('name', models.CharField(max_length=128)),
                ('description', models.TextField(blank=True)),
                ('icon', models.CharField(max_length=64, blank=True)),
                ('is_core', models.BooleanField(default=False)),
                ('order', models.PositiveSmallIntegerField(default=0)),
            ],
            options={'ordering': ['order', 'key']},
        ),

        # ── 2. Plan ───────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Plan',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=128, unique=True)),
                ('slug', models.SlugField(max_length=64, unique=True)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('modules', models.ManyToManyField(
                    blank=True,
                    related_name='plans',
                    to='tenants.Module',
                )),
            ],
            options={'ordering': ['name']},
        ),

        # ── 3. Rename old plan CharField so we keep the value for the data migration ──
        migrations.RenameField(
            model_name='tenant',
            old_name='plan',
            new_name='plan_str',
        ),

        # ── 4. New plan FK (nullable until data migration populates it) ───────
        migrations.AddField(
            model_name='tenant',
            name='plan',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='tenants',
                to='tenants.Plan',
                help_text='Subscription plan.',
            ),
        ),

        # ── 5. Per-tenant module overrides ────────────────────────────────────
        migrations.CreateModel(
            name='TenantModuleOverride',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ('is_enabled', models.BooleanField()),
                ('note', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('module', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='tenant_overrides',
                    to='tenants.Module',
                )),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='module_overrides',
                    to='tenants.Tenant',
                )),
            ],
            options={'ordering': ['module__order'], 'unique_together': {('tenant', 'module')}},
        ),
    ]
