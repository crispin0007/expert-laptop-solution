"""
0004_shift_shiftassignment_attendance_upgrade

Adds:
  - Shift model (named work schedules with overtime rules)
  - ShiftAssignment model (staff → shift effective-date mapping)
  - AttendanceRecord new fields:
      early_exit_minutes, overtime_minutes, break_minutes, admin_remarks, shift FK
"""
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('hrm', '0003_remove_stale_soft_delete_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Shift ──────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='Shift',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='hrm_shift_set',
                    to='tenants.tenant',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('name', models.CharField(max_length=60)),
                ('start_time', models.TimeField()),
                ('end_time', models.TimeField()),
                ('grace_period_minutes', models.PositiveSmallIntegerField(default=15)),
                ('min_work_hours', models.DecimalField(decimal_places=1, default=Decimal('4.0'), max_digits=4)),
                ('overtime_after_hours', models.DecimalField(decimal_places=1, default=Decimal('8.0'), max_digits=4)),
                ('late_threshold_minutes', models.PositiveSmallIntegerField(default=15)),
                ('is_default', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ['name'],
                'unique_together': {('tenant', 'name')},
            },
        ),

        # ── ShiftAssignment ────────────────────────────────────────────────
        migrations.CreateModel(
            name='ShiftAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='hrm_shiftassignment_set',
                    to='tenants.tenant',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('staff', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='shift_assignments',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('shift', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='assignments',
                    to='hrm.shift',
                )),
                ('effective_from', models.DateField()),
                ('effective_to', models.DateField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-effective_from'],
            },
        ),
        migrations.AddIndex(
            model_name='shiftassignment',
            index=models.Index(fields=['tenant', 'staff', 'effective_from'], name='hrm_shiftas_tenant__idx'),
        ),

        # ── AttendanceRecord new fields ────────────────────────────────────
        migrations.AddField(
            model_name='attendancerecord',
            name='early_exit_minutes',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='Minutes the staff left before expected_end_time / shift end.',
            ),
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='overtime_minutes',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='Minutes worked beyond expected_end_time / shift end.',
            ),
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='break_minutes',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='Minutes of break time (deducted from net work hours).',
            ),
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='admin_remarks',
            field=models.TextField(
                blank=True,
                help_text='Admin notes on manual overrides or corrections.',
            ),
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='shift',
            field=models.ForeignKey(
                blank=True,
                help_text='Shift assigned at clock-in time (snapshot).',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='attendance_records',
                to='hrm.shift',
            ),
        ),
    ]
