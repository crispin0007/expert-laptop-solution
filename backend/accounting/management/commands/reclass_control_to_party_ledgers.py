from __future__ import annotations

from collections import Counter
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from accounting.models import Bill, CreditNote, DebitNote, Invoice, JournalEntry, JournalLine, Payment
from accounting.services.journal_service import _make_entry


class Command(BaseCommand):
    help = (
        'Reclass historical AR/AP control postings (1200/2100) into party sub-ledgers '
        'using additive adjustment journals. Existing posted entries are never edited.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=str, default=None, help='Tenant slug (optional).')
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist adjustments. Without this flag, command runs in dry-run mode.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional max number of source lines to process (0 = no limit).',
        )

    @staticmethod
    def _party_account_from_party(party):
        if party is None or not getattr(party, 'account_id', None):
            return None
        account = getattr(party, 'account', None)
        if account is None or not account.is_active:
            return None
        return account

    def _resolve_target_account(self, line: JournalLine):
        entry = line.entry
        ref_type = entry.reference_type
        ref_id = entry.reference_id

        if not ref_id:
            return None

        if ref_type == JournalEntry.REF_INVOICE:
            inv = Invoice.objects.select_related(
                'party__account',
                'customer__party__account',
            ).filter(tenant=entry.tenant, pk=ref_id).first()
            if inv is None:
                return None
            return self._party_account_from_party(inv.party) or self._party_account_from_party(getattr(inv.customer, 'party', None))

        if ref_type == JournalEntry.REF_BILL:
            bill = Bill.objects.select_related(
                'party__account',
                'supplier__party__account',
            ).filter(tenant=entry.tenant, pk=ref_id).first()
            if bill is None:
                return None
            return self._party_account_from_party(bill.party) or self._party_account_from_party(getattr(bill.supplier, 'party', None))

        if ref_type == JournalEntry.REF_PAYMENT:
            payment = Payment.objects.select_related(
                'party__account',
                'invoice__party__account',
                'invoice__customer__party__account',
                'bill__party__account',
                'bill__supplier__party__account',
            ).filter(tenant=entry.tenant, pk=ref_id).first()
            if payment is None:
                return None
            return (
                self._party_account_from_party(payment.party)
                or self._party_account_from_party(getattr(getattr(payment, 'invoice', None), 'party', None))
                or self._party_account_from_party(getattr(getattr(getattr(payment, 'invoice', None), 'customer', None), 'party', None))
                or self._party_account_from_party(getattr(getattr(payment, 'bill', None), 'party', None))
                or self._party_account_from_party(getattr(getattr(getattr(payment, 'bill', None), 'supplier', None), 'party', None))
            )

        if ref_type == JournalEntry.REF_CREDIT_NOTE:
            cn = CreditNote.objects.select_related('invoice__party__account', 'invoice__customer__party__account').filter(
                tenant=entry.tenant,
                pk=ref_id,
            ).first()
            if cn is None:
                return None
            return self._party_account_from_party(getattr(cn.invoice, 'party', None)) or self._party_account_from_party(
                getattr(getattr(cn.invoice, 'customer', None), 'party', None)
            )

        if ref_type == JournalEntry.REF_DEBIT_NOTE:
            dn = DebitNote.objects.select_related('bill__party__account', 'bill__supplier__party__account').filter(
                tenant=entry.tenant,
                pk=ref_id,
            ).first()
            if dn is None:
                return None
            return self._party_account_from_party(getattr(dn.bill, 'party', None)) or self._party_account_from_party(
                getattr(getattr(dn.bill, 'supplier', None), 'party', None)
            )

        return None

    @staticmethod
    def _line_reclass_token(line: JournalLine) -> str:
        return f'[reclass:jl:{line.id}]'

    def _already_reclassed(self, line: JournalLine) -> bool:
        token = self._line_reclass_token(line)
        return JournalEntry.objects.filter(
            tenant=line.entry.tenant,
            purpose=JournalEntry.PURPOSE_ADJUSTMENT,
            reference_type=JournalEntry.REF_MANUAL,
            description__contains=token,
            is_posted=True,
        ).exists()

    def _build_reclass_lines(self, line: JournalLine, target_account):
        control_account = line.account
        debit = line.debit or Decimal('0')
        credit = line.credit or Decimal('0')

        if debit > 0 and credit > 0:
            return None

        if debit > 0:
            return [
                (target_account, debit, Decimal('0'), f'Reclass DR target for JL#{line.id}'),
                (control_account, Decimal('0'), debit, f'Reclass CR control for JL#{line.id}'),
            ]

        if credit > 0:
            return [
                (control_account, credit, Decimal('0'), f'Reclass DR control for JL#{line.id}'),
                (target_account, Decimal('0'), credit, f'Reclass CR target for JL#{line.id}'),
            ]

        return None

    @transaction.atomic
    def handle(self, *args, **options):
        tenant_slug = options.get('tenant')
        apply = bool(options.get('apply'))
        limit = int(options.get('limit') or 0)
        stats = Counter()

        mode = 'WRITE' if apply else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'AR/AP reclassification started ({mode}).'))

        qs = JournalLine.objects.filter(
            entry__is_posted=True,
            account__code__in=['1200', '2100'],
        ).select_related('entry', 'entry__tenant', 'account', 'entry__created_by').order_by('entry__date', 'id')

        if tenant_slug:
            qs = qs.filter(entry__tenant__slug=tenant_slug)

        processed = 0
        for line in qs.iterator(chunk_size=200):
            if limit and processed >= limit:
                break
            processed += 1

            if self._already_reclassed(line):
                stats['line.already_reclassed'] += 1
                continue

            target_account = self._resolve_target_account(line)
            if target_account is None:
                stats['line.unresolved_party_account'] += 1
                continue

            if target_account.id == line.account_id:
                stats['line.already_on_target'] += 1
                continue

            lines = self._build_reclass_lines(line, target_account)
            if not lines:
                stats['line.invalid_amount'] += 1
                continue

            token = self._line_reclass_token(line)
            desc = (
                f'AR/AP control reclass {token} '
                f'source={line.entry.entry_number} control={line.account.code} target={target_account.code}'
            )

            if apply:
                try:
                    _make_entry(
                        tenant=line.entry.tenant,
                        created_by=line.entry.created_by,
                        date=line.entry.date,
                        description=desc,
                        reference_type=JournalEntry.REF_MANUAL,
                        reference_id=line.id,
                        lines=lines,
                        purpose=JournalEntry.PURPOSE_ADJUSTMENT,
                    )
                    stats['line.reclassed'] += 1
                except Exception:
                    stats['line.error'] += 1
            else:
                stats['line.would_reclass'] += 1

        if not apply:
            transaction.set_rollback(True)

        if not stats:
            stats['none'] = 1

        self.stdout.write(self.style.SUCCESS(f'AR/AP reclassification completed ({mode}).'))
        for key in sorted(stats.keys()):
            self.stdout.write(f'{key}: {stats[key]}')
