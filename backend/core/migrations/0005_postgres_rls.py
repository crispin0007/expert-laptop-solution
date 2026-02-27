"""
Migration 0005 — PostgreSQL Row-Level Security (RLS) on tenant-scoped tables.

RLS adds a database-layer guarantee that a query running as the ``nexus``
app user can only see rows for the tenant that the current Django request
is serving, regardless of any ORM or application bug.

Implementation
--------------
TenantMiddleware (core/middleware.py) calls:

    SET LOCAL nexus.tenant_id = '<tenant_pk>';  -- on each request

The policy evaluates ``current_setting('nexus.tenant_id', TRUE)`` per row:

  - Empty string (not set, or explicitly reset to ''):
      ALL rows are visible.  Used for superadmin/maintenance context.
  - Non-empty string:
      Only rows where ``tenant_id = nexus.tenant_id::bigint`` are visible.

FORCE ROW LEVEL SECURITY ensures the policy applies even to the table
owner (the ``nexus`` DB user), not only to other users.

Scope
-----
Applied to the 10 core tenant-scoped tables that carry the highest risk of
cross-tenant data leakage:
  tickets, customers, departments, projects, accounting_invoice,
  accounting_quotation, inventory_product, inventory_stockmovement,
  accounts_tenantmembership, notifications_notification.

The remaining ~47 tenant-scoped tables are protected by TenantManager at the
ORM level. Add them here incrementally as you gain confidence in the policy.

Limitations
-----------
* RLS is only active when the PostgreSQL session variable ``nexus.tenant_id``
  is set.  For CONN_MAX_AGE > 0 (connection reuse), TenantMiddleware must
  reset the variable at the end of every response — see process_response().
* For 100% coverage including fresh connections, implement a custom Django
  database backend that sets the variable in ``get_new_connection()``.
"""

from django.db import migrations

# Tables to apply RLS on (schema: all have a tenant_id bigint column)
_TABLES = [
    'tickets_ticket',
    'customers_customer',
    'departments_department',
    'projects_project',
    'accounting_invoice',
    'accounting_quotation',
    'inventory_product',
    'inventory_stockmovement',
    'accounts_tenantmembership',
    'notifications_notification',
]


def _enable_rls_sql(table: str) -> str:
    """Generate SQL to enable RLS and create tenant isolation policy for a table."""
    return f"""
        -- {table}: enable RLS
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

        -- Drop any existing policy (idempotent re-runs)
        DROP POLICY IF EXISTS nexus_tenant_isolation ON {table};

        -- Allow all rows when nexus.tenant_id is not set (empty string) —
        -- required for superadmin queries and Celery tasks that don't run in
        -- a tenant context.  When set, restrict to the matching tenant.
        CREATE POLICY nexus_tenant_isolation ON {table}
            USING (
                NULLIF(current_setting('nexus.tenant_id', TRUE), '') IS NULL
                OR tenant_id = NULLIF(current_setting('nexus.tenant_id', TRUE), '')::bigint
            );
    """


def _disable_rls_sql(table: str) -> str:
    """Remove RLS from a table (for migration reversal)."""
    return f"""
        DROP POLICY IF EXISTS nexus_tenant_isolation ON {table};
        ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY;
    """


class Migration(migrations.Migration):

    dependencies = [
        # core must come last so all the target tables already exist
        ('core', '0004_bannedip'),
        # Tables targeted by RLS — declare explicit dependencies so the test
        # runner applies migrations in the right order.
        ('tickets',       '0010_indexes_and_seq'),
        ('customers',     '0006_nepal_address_optional_email'),
        ('departments',   '0002_sprint2_fields'),
        ('accounting',    '0006_add_quotation_debitnote_tds_bankreconciliation_recurringjournal'),
        ('inventory',     '0006_indexes_and_seq'),
        ('notifications', '0002_alter_notification_notification_type'),
        ('accounts',      '0004_add_staff_number'),
        ('projects',      '0007_indexes_and_seq'),
    ]

    operations = [
        migrations.RunSQL(
            sql='\n'.join(_enable_rls_sql(t) for t in _TABLES),
            reverse_sql='\n'.join(_disable_rls_sql(t) for t in _TABLES),
        ),
    ]
