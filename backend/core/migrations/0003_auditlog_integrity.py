"""
Migration 0003 — Audit log tamper protection.

Two layers of defence:

1. **row_hash field** — an HMAC-SHA256 integrity seal computed by log_event()
   at insert time (see core/audit.py).  Any application that reads audit rows
   can call verify_row_hash(log) to detect modifications.

2. **PostgreSQL trigger** — a BEFORE UPDATE OR DELETE trigger that raises a
   hard exception at the DB level, making it impossible to silently modify or
   purge audit rows even via a direct psql session or a compromised service
   account.  The trigger does NOT block INSERT (append-only).

   To legitimately remove old rows (e.g. GDPR purge) you must:
     a. DROP the trigger (requires DB superuser), OR
     b. Use TRUNCATE (not caught by row-level triggers) with a superuser role,
        followed by recreating the trigger.
   Both actions leave evidence in the Postgres server log.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_auditlog'),
    ]

    operations = [
        # ── 1. Add the row_hash column ────────────────────────────────────────
        migrations.AddField(
            model_name='auditlog',
            name='row_hash',
            field=models.CharField(
                max_length=64,
                blank=True,
                default='',
                help_text=(
                    'HMAC-SHA256 integrity seal. '
                    'Blank on rows created before migration 0003.'
                ),
            ),
        ),

        # ── 2. PostgreSQL immutability trigger ────────────────────────────────
        migrations.RunSQL(
            sql="""
                -- Function: raise an exception on any UPDATE or DELETE attempt.
                CREATE OR REPLACE FUNCTION core_auditlog_immutable()
                RETURNS TRIGGER
                LANGUAGE plpgsql
                SECURITY DEFINER
                AS $$
                BEGIN
                    RAISE EXCEPTION
                        'core_auditlog rows are immutable. '
                        'Security policy prohibits UPDATE or DELETE on the audit log. '
                        'Operation: %, Table: %',
                        TG_OP, TG_TABLE_NAME;
                    RETURN NULL;  -- unreachable; satisfies PL/pgSQL RETURNS
                END;
                $$;

                -- Trigger: fires BEFORE every UPDATE or DELETE, row by row.
                DROP TRIGGER IF EXISTS enforce_auditlog_immutability
                    ON core_auditlog;

                CREATE TRIGGER enforce_auditlog_immutability
                    BEFORE UPDATE OR DELETE ON core_auditlog
                    FOR EACH ROW
                    EXECUTE FUNCTION core_auditlog_immutable();
            """,
            reverse_sql="""
                DROP TRIGGER IF EXISTS enforce_auditlog_immutability ON core_auditlog;
                DROP FUNCTION IF EXISTS core_auditlog_immutable();
            """,
        ),
    ]
