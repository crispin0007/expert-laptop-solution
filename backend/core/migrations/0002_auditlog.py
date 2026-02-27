from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_tenantsequence'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenant_id',  models.IntegerField(blank=True, db_index=True, null=True, help_text='Tenant PK — null for main-domain events')),
                ('actor_id',   models.IntegerField(blank=True, db_index=True, null=True, help_text='User PK — null for unauthenticated events')),
                ('event',      models.CharField(choices=[
                    ('login_success', 'Login Success'),
                    ('login_failed', 'Login Failed'),
                    ('token_refresh', 'Token Refreshed'),
                    ('token_rejected', 'Token Rejected'),
                    ('logout', 'Logout'),
                    ('tenant_created', 'Tenant Created'),
                    ('tenant_suspended', 'Tenant Suspended'),
                    ('tenant_activated', 'Tenant Activated'),
                    ('tenant_deleted', 'Tenant Deleted'),
                    ('slug_change_blocked', 'Slug Change Blocked'),
                    ('plan_changed', 'Plan Changed'),
                    ('module_override_set', 'Module Override Set'),
                    ('module_override_deleted', 'Module Override Deleted'),
                    ('module_toggled', 'Plan Module Toggled'),
                    ('cross_tenant_probe', 'Cross-Tenant Access Attempt'),
                    ('tenant_enum_probe', 'Tenant Enumeration Probe'),
                    ('admin_probe', 'Admin Path Probe from Tenant'),
                    ('superadmin_ip_blocked', 'Superadmin Access IP Blocked'),
                    ('permission_denied', 'Permission Denied'),
                    ('rate_limit_hit', 'Rate Limit Exceeded'),
                    ('staff_deactivated', 'Staff Deactivated'),
                    ('staff_reactivated', 'Staff Reactivated'),
                    ('role_changed', 'Member Role Changed'),
                ], db_index=True, max_length=64)),
                ('ip',         models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=512)),
                ('timestamp',  models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('extra',      models.JSONField(blank=True, default=dict, help_text='Arbitrary event metadata (slugs, role names, etc.)')),
            ],
            options={
                'ordering': ['-timestamp'],
            },
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['tenant_id', 'event', '-timestamp'], name='audit_tenant_event_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['actor_id', '-timestamp'], name='audit_actor_idx'),
        ),
    ]
