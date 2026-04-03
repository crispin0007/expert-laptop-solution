from django.db import models, transaction
from django.conf import settings


# ──────────────────────────────────────────────────────────────────────────────
# Tenant-scoped sequential number generator
# ──────────────────────────────────────────────────────────────────────────────

class TenantSequence(models.Model):
    """
    One row per (tenant_id, key) pair acting as an atomic counter.

    Use next_seq() instead of accessing this model directly.
    """
    # Intentionally raw int (not FK) so this model has zero dependency on
    # other apps and can live in the first core migration.
    tenant_id  = models.IntegerField(db_index=True)
    key        = models.CharField(max_length=64)
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('tenant_id', 'key')

    def __str__(self):
        return f"{self.tenant_id}/{self.key}: {self.last_value}"


def next_seq(
    tenant_id: int,
    key: str,
    model_class=None,
    field_name: str | None = None,
) -> int:
    """
    Return the next sequential integer for *key* scoped to *tenant_id*.

    The counter is incremented atomically inside a ``SELECT FOR UPDATE``
    transaction, making it safe under concurrent Gunicorn workers or Celery
    tasks.  Numbers are never reused, even if a save() fails after the counter
    is bumped (intentional — gaps are better than duplicates).

    Self-seeding
    ------------
    On the very first call for a (tenant_id, key) pair the function inspects
    existing rows via *model_class* + *field_name* and seeds the counter to the
    current maximum.  This prevents re-issuing numbers that were already
    assigned before this feature was deployed.

    Example
    -------
    ::

        from core.models import next_seq
        self.ticket_number = f"TKT-{next_seq(self.tenant_id, 'ticket', Ticket, 'ticket_number'):04d}"
    """
    with transaction.atomic():
        try:
            seq = TenantSequence.objects.select_for_update().get(
                tenant_id=tenant_id, key=key
            )
        except TenantSequence.DoesNotExist:
            # First use for this (tenant, key) — seed from existing data so
            # we never re-issue a number already stored in the DB.
            seed = 0
            if model_class and field_name:
                for raw in model_class.objects.filter(
                    tenant_id=tenant_id
                ).values_list(field_name, flat=True):
                    if raw:
                        try:
                            # Handles formats like "TKT-0042", "INV-00001", etc.
                            seed = max(seed, int(str(raw).split('-')[-1]))
                        except (ValueError, IndexError):
                            pass

            # get_or_create inside the atomic block handles the rare race
            # where two processes both hit DoesNotExist simultaneously.
            seq, created = TenantSequence.objects.get_or_create(
                tenant_id=tenant_id,
                key=key,
                defaults={'last_value': seed},
            )
            if not created:
                # Another racing process won the creation — lock and re-fetch.
                seq = TenantSequence.objects.select_for_update().get(
                    tenant_id=tenant_id, key=key
                )

        seq.last_value += 1
        seq.save(update_fields=['last_value'])
        return seq.last_value


class TenantManager(models.Manager):
    """
    Default manager for all TenantModel subclasses.
    Does NOT auto-filter — filtering is done explicitly in TenantMixin
    via request.tenant to avoid thread-local / contextvar state bugs.
    """
    pass


class TenantModel(models.Model):
    """Abstract base for every tenant-scoped model.

    Fields: tenant (FK to tenants.Tenant), created_at, updated_at, created_by.
    Tenant filtering is enforced at the view layer by TenantMixin,
    NOT by this manager, to avoid implicit global state.
    """

    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='%(class)s_items',
        # null=True kept for DB compatibility (coordinated ALTER TABLE across all
        # inheriting models is required to go non-null at DB level).
        # Enforced at application level via save() below.
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    objects = TenantManager()

    def save(self, *args, **kwargs):
        if self.tenant_id is None:
            raise ValueError(
                f'{self.__class__.__name__} must belong to a tenant '
                '(tenant_id is None). Never create tenant-scoped records '
                'without a tenant — it violates multi-tenancy isolation.'
            )
        super().save(*args, **kwargs)

    class Meta:
        abstract = True
