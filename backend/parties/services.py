from __future__ import annotations

from dataclasses import dataclass

from parties.models import Party


@dataclass
class ResolveResult:
    party: Party | None
    action: str
    reason: str = ''


@dataclass(frozen=True)
class ProfileSpec:
    party_type: str
    reverse_attr: str
    fallback_label: str


def _norm(value: str) -> str:
    return (value or '').strip().lower()


def _party_in_use_conflict(party: Party, attr: str, expected_id: int | None) -> bool:
    linked = getattr(party, attr, None)
    return bool(linked and linked.pk != expected_id)


def _find_candidate(candidates, *, pan: str, email: str, phone: str, name: str):
    if pan:
        match = candidates.filter(pan_number__iexact=pan).first()
        if match is not None:
            return match
    if email:
        match = candidates.filter(email__iexact=email).first()
        if match is not None:
            return match
    if phone and name:
        return candidates.filter(phone__iexact=phone, name__iexact=name).first()
    return None


def _next_party_account_code(tenant, *, prefix: str) -> str:
    """Generate the next tenant-scoped ledger code for party sub-ledgers."""
    from accounting.models import Account

    existing = set(
        Account.objects.filter(tenant=tenant, code__regex=rf'^{prefix}\d+$')
        .values_list('code', flat=True)
    )

    number = 1
    while True:
        code = f'{prefix}{number:03d}'
        if code not in existing:
            return code
        number += 1


def _ensure_party_ledger_account(party: Party, *, dry_run: bool = False) -> None:
    """Create/link a CoA sub-ledger account for customer/supplier parties."""
    if party is None or party.tenant_id is None:
        return
    if party.party_type not in {Party.TYPE_CUSTOMER, Party.TYPE_SUPPLIER}:
        return
    if party.account_id:
        return
    if dry_run:
        return

    from accounting.models import Account, AccountGroup
    from accounting.services.journal_service import seed_chart_of_accounts

    tenant = party.tenant
    seed_chart_of_accounts(tenant, created_by=party.created_by)

    if party.party_type == Party.TYPE_CUSTOMER:
        group_slug = 'sundry_debtors'
        control_code = '1200'
        code_prefix = '12'
        account_type = Account.TYPE_ASSET
    else:
        group_slug = 'sundry_creditors'
        control_code = '2100'
        code_prefix = '21'
        account_type = Account.TYPE_LIABILITY

    group = AccountGroup.objects.filter(tenant=tenant, slug=group_slug).first()
    control_account = Account.objects.filter(tenant=tenant, code=control_code).first()
    if group is None or control_account is None:
        return

    code = _next_party_account_code(tenant, prefix=code_prefix)
    account = Account.objects.create(
        tenant=tenant,
        created_by=party.created_by,
        code=code,
        name=party.name,
        type=account_type,
        group=group,
        parent=control_account,
        description=f'Party sub-ledger: {party.party_type}',
        is_system=False,
    )

    party.account = account
    party.save(update_fields=['account', 'updated_at'])


def _resolve_or_create_party(profile, *, spec: ProfileSpec, dry_run: bool = False) -> ResolveResult:
    if profile.party_id:
        _ensure_party_ledger_account(profile.party, dry_run=dry_run)
        return ResolveResult(party=profile.party, action='already-linked')

    tenant = profile.tenant
    if tenant is None:
        return ResolveResult(party=None, action='skipped', reason=f'{spec.fallback_label.lower()} has no tenant')

    name = (profile.name or '').strip()
    email = _norm(getattr(profile, 'email', ''))
    phone = _norm(getattr(profile, 'phone', ''))
    pan = _norm(getattr(profile, 'pan_number', ''))

    candidates = Party.objects.filter(tenant=tenant, party_type=spec.party_type)
    party = _find_candidate(candidates, pan=pan, email=email, phone=phone, name=name)

    if party is not None and _party_in_use_conflict(party, spec.reverse_attr, profile.pk):
        return ResolveResult(
            party=None,
            action='conflict',
            reason=f'matched party already linked to another {spec.fallback_label.lower()}',
        )

    if party is None:
        if dry_run:
            return ResolveResult(party=None, action='would-create')
        party = Party.objects.create(
            tenant=tenant,
            created_by=profile.created_by,
            name=name or f'{spec.fallback_label} #{profile.pk}',
            party_type=spec.party_type,
            email=getattr(profile, 'email', '') or '',
            phone=getattr(profile, 'phone', '') or '',
            pan_number=getattr(profile, 'pan_number', '') or '',
            is_active=bool(getattr(profile, 'is_active', True)),
            notes=getattr(profile, 'notes', '') or '',
        )
        profile.party = party
        profile.save(update_fields=['party', 'updated_at'])
        _ensure_party_ledger_account(party, dry_run=dry_run)
        return ResolveResult(party=party, action='created-and-linked')

    if dry_run:
        return ResolveResult(party=party, action='would-link')

    profile.party = party
    profile.save(update_fields=['party', 'updated_at'])
    _ensure_party_ledger_account(party, dry_run=dry_run)
    return ResolveResult(party=party, action='linked-existing')


def resolve_or_create_customer_party(customer, *, dry_run: bool = False) -> ResolveResult:
    """Resolve or create a customer party for a Customer profile.

    This function is idempotent and favors deterministic matching based on
    tenant-scoped PAN/email/phone+name keys before creating a new Party.
    """
    spec = ProfileSpec(
        party_type=Party.TYPE_CUSTOMER,
        reverse_attr='customer_profile',
        fallback_label='Customer',
    )
    return _resolve_or_create_party(customer, spec=spec, dry_run=dry_run)


def resolve_or_create_supplier_party(supplier, *, dry_run: bool = False) -> ResolveResult:
    """Resolve or create a supplier party for a Supplier profile.

    This function is idempotent and favors deterministic matching based on
    tenant-scoped PAN/email/phone+name keys before creating a new Party.
    """
    spec = ProfileSpec(
        party_type=Party.TYPE_SUPPLIER,
        reverse_attr='supplier_profile',
        fallback_label='Supplier',
    )
    return _resolve_or_create_party(supplier, spec=spec, dry_run=dry_run)
