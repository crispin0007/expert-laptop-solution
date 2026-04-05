from __future__ import annotations

from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from accounting.models import Bill, Payment
from parties.models import Party


def _norm_name(value: str) -> str:
    return (value or '').strip()


def _resolve_unique_party_for_bill_name(bill) -> tuple[str, int | None]:
    supplier_name = _norm_name(bill.supplier_name)
    if not supplier_name:
        return 'no-name', None

    candidates = Party.objects.filter(
        tenant=bill.tenant,
        party_type=Party.TYPE_SUPPLIER,
        name__iexact=supplier_name,
    ).only('id')

    count = candidates.count()
    if count == 0:
        return 'no-match', None
    if count > 1:
        return 'ambiguous', None
    return 'matched', candidates.first().id


def _resolve_unique_party_for_payment_name(payment) -> tuple[str, int | None]:
    party_name = _norm_name(payment.party_name)
    if not party_name:
        return 'no-name', None

    expected_type = Party.TYPE_CUSTOMER if payment.type == Payment.TYPE_INCOMING else Party.TYPE_SUPPLIER
    candidates = Party.objects.filter(
        tenant=payment.tenant,
        party_type=expected_type,
        name__iexact=party_name,
    ).only('id')

    count = candidates.count()
    if count == 0:
        return 'no-match', None
    if count > 1:
        return 'ambiguous', None
    return 'matched', candidates.first().id


class Command(BaseCommand):
    help = (
        'Safely remediate accounting party links using legacy name fields. '
        'Only links when a unique tenant-scoped Party name match exists.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--write',
            action='store_true',
            help='Persist updates. By default, command runs as dry-run.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional per-model limit for staged rollout (0 = no limit).',
        )
        parser.add_argument(
            '--sample',
            type=int,
            default=10,
            help='How many sample IDs to print per result bucket (default: 10).',
        )

    def _record(self, *, stats: Counter, samples: dict, action: str, obj_id: int, sample: int):
        stats[action] += 1
        if sample > 0 and len(samples[action]) < sample:
            samples[action].append(obj_id)

    def _print_summary(self, title: str, stats: Counter, samples: dict):
        self.stdout.write(self.style.SUCCESS(f'{title}: {dict(stats)}'))
        for key in ('matched', 'linked', 'would-link', 'no-name', 'no-match', 'ambiguous'):
            ids = samples.get(key, [])
            if ids:
                self.stdout.write(f'  {key} sample_ids={ids}')

    def _process_bill(self, *, bill, write: bool, sample: int, stats: Counter, samples: dict):
        status, party_id = _resolve_unique_party_for_bill_name(bill)
        if status != 'matched':
            self._record(stats=stats, samples=samples, action=status, obj_id=bill.pk, sample=sample)
            return

        self._record(stats=stats, samples=samples, action='matched', obj_id=bill.pk, sample=sample)
        if write:
            bill.party_id = party_id
            bill.save(update_fields=['party', 'updated_at'])
            self._record(stats=stats, samples=samples, action='linked', obj_id=bill.pk, sample=sample)
            return

        self._record(stats=stats, samples=samples, action='would-link', obj_id=bill.pk, sample=sample)

    def _process_payment(self, *, payment, write: bool, sample: int, stats: Counter, samples: dict):
        status, party_id = _resolve_unique_party_for_payment_name(payment)
        if status != 'matched':
            self._record(stats=stats, samples=samples, action=status, obj_id=payment.pk, sample=sample)
            return

        self._record(stats=stats, samples=samples, action='matched', obj_id=payment.pk, sample=sample)
        if write:
            payment.party_id = party_id
            payment.save(update_fields=['party', 'updated_at'])
            self._record(stats=stats, samples=samples, action='linked', obj_id=payment.pk, sample=sample)
            return

        self._record(stats=stats, samples=samples, action='would-link', obj_id=payment.pk, sample=sample)

    def handle(self, *args, **options):
        write = bool(options['write'])
        limit = max(int(options['limit'] or 0), 0)
        sample = max(int(options['sample'] or 10), 0)

        mode = 'WRITE' if write else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'Accounting party remediation ({mode})'))

        bill_qs = Bill.objects.filter(
            party__isnull=True,
            supplier__isnull=True,
        ).select_related('tenant')

        payment_qs = Payment.objects.filter(
            party__isnull=True,
            invoice__isnull=True,
            bill__isnull=True,
        ).select_related('tenant')

        if limit > 0:
            bill_qs = bill_qs[:limit]
            payment_qs = payment_qs[:limit]

        bill_stats = Counter()
        payment_stats = Counter()
        bill_samples = defaultdict(list)
        payment_samples = defaultdict(list)

        with transaction.atomic():
            for bill in bill_qs.iterator(chunk_size=200):
                self._process_bill(
                    bill=bill,
                    write=write,
                    sample=sample,
                    stats=bill_stats,
                    samples=bill_samples,
                )

            for payment in payment_qs.iterator(chunk_size=200):
                self._process_payment(
                    payment=payment,
                    write=write,
                    sample=sample,
                    stats=payment_stats,
                    samples=payment_samples,
                )

            if not write:
                transaction.set_rollback(True)

        self._print_summary('Bills (supplier_name-based)', bill_stats, bill_samples)
        self._print_summary('Payments (party_name-based)', payment_stats, payment_samples)
