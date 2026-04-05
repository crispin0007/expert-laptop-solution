from __future__ import annotations

from django.core.management.base import BaseCommand

from customers.models import Customer
from inventory.models import Supplier


class Command(BaseCommand):
    help = 'Audit missing Party links for Customer and Supplier profiles.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--sample',
            type=int,
            default=10,
            help='How many missing IDs to print per model (default: 10).',
        )

    def handle(self, *args, **options):
        sample = max(int(options['sample'] or 10), 0)

        missing_customers = Customer.objects.filter(party__isnull=True).order_by('id')
        missing_suppliers = Supplier.objects.filter(party__isnull=True).order_by('id')

        c_total = Customer.objects.count()
        s_total = Supplier.objects.count()
        c_missing = missing_customers.count()
        s_missing = missing_suppliers.count()

        self.stdout.write(self.style.SUCCESS('Party link audit summary'))
        self.stdout.write(f'Customers: total={c_total} missing_party={c_missing} linked={c_total - c_missing}')
        self.stdout.write(f'Suppliers: total={s_total} missing_party={s_missing} linked={s_total - s_missing}')

        if sample > 0 and c_missing:
            ids = list(missing_customers.values_list('id', flat=True)[:sample])
            self.stdout.write(self.style.WARNING(f'Missing customer IDs (sample): {ids}'))

        if sample > 0 and s_missing:
            ids = list(missing_suppliers.values_list('id', flat=True)[:sample])
            self.stdout.write(self.style.WARNING(f'Missing supplier IDs (sample): {ids}'))

        if c_missing == 0 and s_missing == 0:
            self.stdout.write(self.style.SUCCESS('All customer and supplier profiles are linked to Party.'))
