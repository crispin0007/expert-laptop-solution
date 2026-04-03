"""
0020_add_unique_constraints

C8  — enforce (tenant, invoice_number) and (tenant, bill_number) uniqueness at
      the database level.  Conditional constraints exclude blank strings so
      draft records that have not yet received a number can coexist safely.

M10 — replace CostCentre unique_together ('tenant', 'code') with a conditional
      UniqueConstraint that only fires when code is non-blank.  The old
      unique_together prevented multiple cost-centres without a code inside
      the same tenant.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0019_bill_add_tds_rate'),
    ]

    operations = [

        # ── M10: remove the old unconditional unique_together ─────────────────
        migrations.AlterUniqueTogether(
            name='costcentre',
            unique_together=set(),
        ),

        # ── M10: add conditional unique (only when code is non-blank) ─────────
        migrations.AddConstraint(
            model_name='costcentre',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'code'],
                condition=models.Q(code__gt=''),
                name='acc_costcentre_tenant_code_uniq',
            ),
        ),

        # ── C8: unique (tenant, invoice_number) where invoice_number != '' ────
        migrations.AddConstraint(
            model_name='invoice',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'invoice_number'],
                condition=models.Q(invoice_number__gt=''),
                name='acc_invoice_tenant_number_uniq',
            ),
        ),

        # ── C8: unique (tenant, bill_number) where bill_number != '' ──────────
        migrations.AddConstraint(
            model_name='bill',
            constraint=models.UniqueConstraint(
                fields=['tenant', 'bill_number'],
                condition=models.Q(bill_number__gt=''),
                name='acc_bill_tenant_number_uniq',
            ),
        ),
    ]
