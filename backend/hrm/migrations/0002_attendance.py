"""
hrm/migrations/0002_attendance.py

Adds AttendancePolicy (singleton per tenant) and AttendanceRecord (one per
staff per calendar day) to the HRM module.
"""
import datetime
from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hrm', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── AttendancePolicy ──────────────────────────────────────────────────
        migrations.CreateModel(
            name='AttendancePolicy',
            fields=[
                ('id',                        models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at',                models.DateTimeField(auto_now_add=True)),
                ('updated_at',                models.DateTimeField(auto_now=True)),
                ('is_deleted',                models.BooleanField(default=False, db_index=True)),
                ('deleted_at',                models.DateTimeField(null=True, blank=True)),
                ('tenant',                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='%(app_label)s_%(class)s_set', to='tenants.tenant')),
                ('expected_start_time',       models.TimeField(default=datetime.time(9, 0))),
                ('expected_end_time',         models.TimeField(default=datetime.time(18, 0))),
                ('late_threshold_minutes',    models.PositiveSmallIntegerField(default=15)),
                ('grace_period_minutes',      models.PositiveSmallIntegerField(default=0)),
                ('half_day_threshold_hours',  models.DecimalField(decimal_places=1, default=Decimal('4.0'), max_digits=4)),
                ('work_days',                 models.JSONField(default=list, help_text='List of Python weekday() integers. Mon=0 … Sun=6. Nepal default: [0,1,2,3,4,6].')),
                ('deduct_absent',             models.BooleanField(default=True)),
                ('deduct_late',               models.BooleanField(default=True)),
                ('late_deduction_grace_minutes', models.PositiveSmallIntegerField(default=60)),
            ],
            options={
                'ordering': ['-created_at'],
                'abstract': False,
            },
        ),
        migrations.AddConstraint(
            model_name='attendancepolicy',
            constraint=models.UniqueConstraint(
                fields=['tenant'],
                name='hrm_attendance_policy_one_per_tenant',
            ),
        ),

        # ── AttendanceRecord ──────────────────────────────────────────────────
        migrations.CreateModel(
            name='AttendanceRecord',
            fields=[
                ('id',               models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at',       models.DateTimeField(auto_now_add=True)),
                ('updated_at',       models.DateTimeField(auto_now=True)),
                ('is_deleted',       models.BooleanField(default=False, db_index=True)),
                ('deleted_at',       models.DateTimeField(null=True, blank=True)),
                ('tenant',           models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='%(app_label)s_%(class)s_set', to='tenants.tenant')),
                ('staff',            models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_records', to=settings.AUTH_USER_MODEL)),
                ('clocked_in_by',    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='manual_attendance_records', to=settings.AUTH_USER_MODEL)),
                ('date',             models.DateField(db_index=True)),
                ('clock_in',         models.DateTimeField(blank=True, null=True)),
                ('clock_out',        models.DateTimeField(blank=True, null=True)),
                ('clock_in_lat',     models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('clock_in_lng',     models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('clock_out_lat',    models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('clock_out_lng',    models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('clock_in_source',  models.CharField(choices=[('manual', 'Manual'), ('web', 'Web'), ('mobile', 'Mobile')], default='web', max_length=16)),
                ('clock_out_source', models.CharField(choices=[('manual', 'Manual'), ('web', 'Web'), ('mobile', 'Mobile')], default='web', max_length=16)),
                ('status',           models.CharField(choices=[('present', 'Present'), ('absent', 'Absent'), ('late', 'Late'), ('half_day', 'Half Day'), ('on_leave', 'On Leave'), ('holiday', 'Holiday'), ('wfh', 'Work From Home')], db_index=True, default='absent', max_length=16)),
                ('late_minutes',     models.PositiveSmallIntegerField(default=0)),
                ('work_hours',       models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=5)),
                ('note',             models.TextField(blank=True)),
            ],
            options={
                'ordering': ['-created_at'],
                'abstract': False,
            },
        ),
        migrations.AlterUniqueTogether(
            name='attendancerecord',
            unique_together={('tenant', 'staff', 'date')},
        ),
        migrations.AddIndex(
            model_name='attendancerecord',
            index=models.Index(fields=['tenant', 'staff', 'date'], name='hrm_attend_tenant__staff_date_idx'),
        ),
        migrations.AddIndex(
            model_name='attendancerecord',
            index=models.Index(fields=['tenant', 'date'], name='hrm_attend_tenant_date_idx'),
        ),
        # ── created_by from TenantModel base ─────────────────────────────────
        migrations.AddField(
            model_name='attendancepolicy',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
    ]
