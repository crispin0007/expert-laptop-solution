"""
hrm/migrations/0003_remove_stale_soft_delete_fields.py

AttendancePolicy and AttendanceRecord were created (in 0002) with
is_deleted / deleted_at columns that are NOT Python model fields — they
were erroneously included in the CreateModel migration.  This migration
removes those orphaned DB columns so INSERT statements no longer fail with
a NOT NULL constraint violation.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('hrm', '0002_attendance'),
    ]

    operations = [
        migrations.RemoveField(model_name='attendancepolicy',  name='is_deleted'),
        migrations.RemoveField(model_name='attendancepolicy',  name='deleted_at'),
        migrations.RemoveField(model_name='attendancerecord',  name='is_deleted'),
        migrations.RemoveField(model_name='attendancerecord',  name='deleted_at'),
    ]
