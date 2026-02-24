from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Custom user model — uses email as the primary login credential."""

    # Override email to be unique and required
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    avatar = models.URLField(blank=True)
    is_superadmin = models.BooleanField(default=False, help_text='Platform-level super admin')

    USERNAME_FIELD = 'email'
    # username is still required by AbstractUser; keep it but make it optional
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email or self.username


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'tenant')

    def save(self, *args, **kwargs):
        if not self.staff_number and self.tenant_id:
            last = (
                TenantMembership.objects.filter(tenant_id=self.tenant_id)
                .order_by('created_at')
                .values_list('staff_number', flat=True)
                .last()
            )
            if last:
                try:
                    seq = int(last.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1
            self.staff_number = f"STF-{seq:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} @ {self.tenant} ({self.role})"
