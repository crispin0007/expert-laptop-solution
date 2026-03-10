from django.db import models
from core.models import TenantModel
from django.conf import settings


class Project(TenantModel):
    STATUS_PLANNING = 'planning'
    STATUS_ACTIVE = 'active'
    STATUS_ON_HOLD = 'on_hold'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_PLANNING, 'Planning'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_ON_HOLD, 'On Hold'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    name = models.CharField(max_length=255)
    # Auto-generated human-readable reference, e.g. PRJ-0001 (per tenant)
    project_number = models.CharField(max_length=32, blank=True, db_index=True)
    description = models.TextField(blank=True)
    customer = models.ForeignKey(
        'customers.Customer',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='projects',
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='managed_projects',
    )
    # Additional staff working on this project
    team_members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='project_teams',
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PLANNING)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    budget = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    # Optional phone number to contact for this project
    contact_phone = models.CharField(max_length=32, blank=True, help_text='Phone number to contact for this project')
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'],     name='project_tenant_status_idx'),
            models.Index(fields=['tenant', 'is_deleted'], name='project_tenant_deleted_idx'),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.project_number and self.tenant_id:
            from core.models import next_seq
            self.project_number = f"PRJ-{next_seq(self.tenant_id, 'project', Project, 'project_number'):04d}"
        super().save(*args, **kwargs)


class ProjectMilestone(TenantModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=255)
    due_date = models.DateField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['due_date']

    def __str__(self):
        return f"{self.project.name} — {self.name}"


class ProjectTask(TenantModel):
    STATUS_TODO = 'todo'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_DONE = 'done'
    STATUS_BLOCKED = 'blocked'

    STATUS_CHOICES = [
        (STATUS_TODO, 'To Do'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_DONE, 'Done'),
        (STATUS_BLOCKED, 'Blocked'),
    ]

    PRIORITY_LOW = 'low'
    PRIORITY_MEDIUM = 'medium'
    PRIORITY_HIGH = 'high'

    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    milestone = models.ForeignKey(
        ProjectMilestone,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='tasks',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_TODO)
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='project_tasks',
    )
    due_date = models.DateField(null=True, blank=True)
    estimated_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    actual_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['due_date', '-priority']

    def __str__(self):
        return f"[{self.status}] {self.title} ({self.project.name})"


class ProjectProduct(TenantModel):
    """Products / parts linked to a project (planned usage)."""
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='project_products',
    )
    product = models.ForeignKey(
        'inventory.Product',
        on_delete=models.CASCADE,
        related_name='project_usages',
    )
    quantity_planned = models.PositiveIntegerField(default=1)
    note = models.TextField(blank=True)

    class Meta:
        unique_together = ('project', 'product')
        ordering = ['product__name']

    def __str__(self):
        return f"{self.project.project_number} — {self.product.name} ×{self.quantity_planned}"


class ProjectProductRequest(TenantModel):
    """A staff member's request to use a product on a project.

    Workflow: staff creates (pending) → manager/admin approves or rejects.
    On approval a ProjectProduct record is upserted automatically.
    """

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='product_requests',
    )
    product = models.ForeignKey(
        'inventory.Product',
        on_delete=models.CASCADE,
        related_name='project_requests',
    )
    quantity = models.PositiveIntegerField(default=1)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='product_requests_made',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='product_requests_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.project.project_number} — {self.product.name} ({self.status})"


class ProjectMemberSchedule(TenantModel):
    """
    Tracks which specific dates each team member is scheduled to work on a project.

    One row = one member + one date on a project.
    Managers schedule dates upfront; presence is marked after the day.
    Coin/salary for the period = tasks_completed_coins + days_present × daily_coin_rate.
    """

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='schedules',
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='project_schedules',
    )
    work_date = models.DateField(help_text='The calendar date this member is scheduled to work.')
    is_present = models.BooleanField(
        default=False,
        help_text='Set to True by the manager once the member has worked this day.',
    )
    note = models.TextField(blank=True)

    class Meta:
        unique_together = ('project', 'member', 'work_date')
        ordering = ['work_date', 'member__first_name']
        indexes = [
            models.Index(fields=['project', 'member'], name='sched_proj_member_idx'),
            models.Index(fields=['project', 'work_date'], name='sched_proj_date_idx'),
        ]

    def __str__(self):
        return f"{self.project.project_number} — {self.member} on {self.work_date}"


class ProjectAttachment(TenantModel):
    """Files attached to a project."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='attachments/projects/%Y/%m/')
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(default=0, help_text='Size in bytes')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, on_delete=models.SET_NULL,
        related_name='project_attachments',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.file_name} on Project {self.project_id}"
