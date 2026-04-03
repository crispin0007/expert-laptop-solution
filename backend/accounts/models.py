import hashlib
import secrets

from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Custom user model — uses email as the primary login credential."""

    # Override email to be unique and required
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=32, blank=True, verbose_name='Personal Phone')
    office_phone = models.CharField(max_length=32, blank=True, verbose_name='Office Phone')
    avatar = models.URLField(blank=True)
    is_superadmin = models.BooleanField(default=False, help_text='Platform-level super admin')

    # ── Two-Factor Authentication ─────────────────────────────────────────────
    is_2fa_enabled = models.BooleanField(default=False)
    totp_secret    = models.CharField(max_length=64, blank=True, default='')
    # List of SHA-256 hex digests of single-use backup codes.
    # Plain codes are shown to the user ONCE; only the hashes are persisted.
    backup_codes   = models.JSONField(default=list, blank=True)

    USERNAME_FIELD = 'email'
    # username is still required by AbstractUser; keep it but make it optional
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email or self.username

    # ── 2FA helpers ───────────────────────────────────────────────────────────

    def generate_backup_codes(self, count: int = 8) -> list[str]:
        """
        Generate `count` single-use backup codes, store their SHA-256 hashes,
        and return the plain codes (displayed to the user exactly once).

        Format: XXXXXXXX (8 uppercase hex chars for readability).
        """
        plain = [secrets.token_hex(4).upper() for _ in range(count)]
        self.backup_codes = [hashlib.sha256(c.encode()).hexdigest() for c in plain]
        return plain

    def verify_backup_code(self, code: str) -> bool:
        """
        Verify a backup code and invalidate it (single-use).
        Returns True if the code was valid and has been consumed.
        """
        digest = hashlib.sha256(code.upper().encode()).hexdigest()
        if digest in (self.backup_codes or []):
            self.backup_codes = [h for h in self.backup_codes if h != digest]
            return True
        return False


class TenantMembership(models.Model):
    """Link a user to a tenant with a role and department."""

    ROLE_CHOICES = [
        ('owner', 'Owner'),
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('staff', 'Staff'),
        ('viewer', 'Viewer'),
        ('custom', 'Custom'),
    ]

    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='memberships')
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='members')
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default='staff')
    # Used when role='custom' — points to a tenant-scoped Role with a JSON permissions map
    custom_role = models.ForeignKey(
        'roles.Role',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='memberships',
    )
    department = models.ForeignKey(
        'departments.Department',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='members',
    )
    employee_id = models.CharField(max_length=64, blank=True)
    # Auto-generated sequential reference per tenant, e.g. STF-0001
    staff_number = models.CharField(max_length=32, blank=True, db_index=True)
    join_date = models.DateField(null=True, blank=True)
    is_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    pan_number = models.CharField(
        max_length=20, blank=True,
        help_text='Nepal PAN (9-digit) — used for TDS reporting',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'tenant')

    def save(self, *args, **kwargs):
        if not self.staff_number and self.tenant_id:
            from core.models import next_seq
            self.staff_number = f"STF-{next_seq(self.tenant_id, 'staff', TenantMembership, 'staff_number'):04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} @ {self.tenant} ({self.role})"
