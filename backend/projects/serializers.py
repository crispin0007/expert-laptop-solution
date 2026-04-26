from django.contrib.auth import get_user_model
from rest_framework import serializers
from core.serializers import NepaliModelSerializer
from .models import Project, ProjectMilestone, ProjectTask, ProjectProduct, ProjectAttachment, ProjectProductRequest, ProjectMemberSchedule

User = get_user_model()


class ProjectMilestoneSerializer(NepaliModelSerializer):
    class Meta:
        model = ProjectMilestone
        fields = ('id', 'project', 'name', 'due_date', 'is_completed', 'completed_at', 'created_at')
        read_only_fields = ('project', 'completed_at', 'created_at')


class ProjectTaskSerializer(NepaliModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectTask
        fields = (
            'id', 'project', 'milestone', 'title', 'description',
            'status', 'priority', 'assigned_to', 'assigned_to_name',
            'due_date', 'estimated_hours', 'actual_hours',
            'completed_at', 'created_at', 'updated_at',
        )
        read_only_fields = ('project', 'completed_at', 'created_at', 'updated_at', 'assigned_to_name')

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.email
        return None


class ProjectProductSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    manual_name = serializers.CharField(required=False, allow_blank=True)
    manual_sku = serializers.CharField(source='product_sku', required=False, allow_blank=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    is_service = serializers.BooleanField(source='product.is_service', read_only=True)

    class Meta:
        model = ProjectProduct
        fields = (
            'id', 'project', 'product', 'product_name', 'product_sku',
            'manual_name', 'manual_sku', 'unit_price', 'is_service',
            'quantity_planned', 'note',
        )
        read_only_fields = ('project', 'product_name', 'product_sku', 'is_service')

    def get_product_name(self, obj):
        if obj.product:
            return obj.product.name
        return obj.manual_name

    def get_product_sku(self, obj):
        if obj.product:
            return obj.product.sku
        return obj.product_sku

    def validate(self, attrs):
        product = attrs.get('product')
        manual_name = (attrs.get('manual_name') or '').strip()
        if not product and not manual_name:
            raise serializers.ValidationError('Either product or manual_name is required.')
        if product and attrs.get('unit_price') is None:
            attrs['unit_price'] = product.unit_price
        if not product and attrs.get('unit_price') is None:
            raise serializers.ValidationError('unit_price is required for manual project requirements.')
        return attrs


class ProjectListSerializer(NepaliModelSerializer):
    """Lightweight serializer for list endpoints — safe for mobile (4-6 fields)."""
    tasks_count = serializers.SerializerMethodField()
    done_tasks_count = serializers.SerializerMethodField()
    manager_name = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id', 'project_number', 'name', 'status',
            'manager', 'manager_name', 'tasks_count', 'done_tasks_count',
            'start_date', 'end_date', 'created_at',
        )
        read_only_fields = fields

    def get_tasks_count(self, obj):
        if hasattr(obj, 'tasks_count'):
            return obj.tasks_count
        return obj.tasks.count()

    def get_done_tasks_count(self, obj):
        if hasattr(obj, 'done_tasks_count'):
            return obj.done_tasks_count
        from .models import ProjectTask
        return obj.tasks.filter(status=ProjectTask.STATUS_DONE).count()

    def get_manager_name(self, obj):
        if obj.manager:
            return obj.manager.get_full_name() or obj.manager.email
        return None


class ProjectSerializer(NepaliModelSerializer):
    milestones = ProjectMilestoneSerializer(many=True, read_only=True)
    tasks_count = serializers.SerializerMethodField()
    done_tasks_count = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source='customer.name', read_only=True, default='')
    customer_phone = serializers.CharField(source='customer.phone', read_only=True, default='')
    customer_email = serializers.CharField(source='customer.email', read_only=True, default='')
    manager_name = serializers.SerializerMethodField()
    team_members = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), required=False,
    )
    team_member_names = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id', 'project_number', 'name', 'description', 'customer', 'customer_name',
            'customer_phone', 'customer_email', 'contact_phone',
            'manager', 'manager_name', 'team_members', 'team_member_names',
            'status', 'start_date', 'end_date', 'budget',
            'milestones', 'tasks_count', 'done_tasks_count', 'created_at', 'updated_at',
        )
        read_only_fields = ('project_number', 'created_at', 'updated_at',
                            'customer_name', 'customer_phone', 'customer_email',
                            'manager_name', 'tasks_count', 'done_tasks_count',
                            'team_member_names')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Scope team_members choices to users who are members of this tenant.
        # Prevents cross-tenant user injection via the team_members field.
        request = self.context.get('request')
        if request and getattr(request, 'tenant', None):
            from accounts.models import TenantMembership
            tenant_user_ids = (
                TenantMembership.objects
                .filter(tenant=request.tenant, is_active=True)
                .values_list('user_id', flat=True)
            )
            self.fields['team_members'].child_relation.queryset = (
                User.objects.filter(pk__in=tenant_user_ids)
            )

    def get_tasks_count(self, obj):
        # Use DB annotation when available (set by ProjectViewSet.get_queryset)
        if hasattr(obj, 'tasks_count'):
            return obj.tasks_count
        return obj.tasks.count()

    def get_done_tasks_count(self, obj):
        if hasattr(obj, 'done_tasks_count'):
            return obj.done_tasks_count
        return obj.tasks.filter(status=ProjectTask.STATUS_DONE).count()

    def get_manager_name(self, obj):
        if obj.manager:
            return obj.manager.get_full_name() or obj.manager.email
        return None

    def get_team_member_names(self, obj):
        # team_members is prefetched by ProjectViewSet.get_queryset — no extra query
        return [u.get_full_name() or u.email for u in obj.team_members.all()]


class ProjectProductRequestSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_sku = serializers.SerializerMethodField()
    manual_name = serializers.CharField(required=False, allow_blank=True)
    manual_sku = serializers.CharField(source='product_sku', required=False, allow_blank=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectProductRequest
        fields = (
            'id', 'project', 'product', 'product_name', 'product_sku',
            'manual_name', 'manual_sku', 'quantity', 'unit_price', 'create_inventory',
            'note', 'status',
            'requested_by', 'requested_by_name',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'rejection_reason', 'created_at',
        )
        read_only_fields = (
            'project', 'status', 'requested_by', 'requested_by_name',
            'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'rejection_reason', 'created_at',
            'product_name', 'product_sku',
        )

    def get_product_name(self, obj):
        if obj.product:
            return obj.product.name
        return obj.manual_name

    def get_product_sku(self, obj):
        if obj.product:
            return obj.product.sku
        return obj.product_sku

    def validate(self, attrs):
        product = attrs.get('product')
        manual_name = (attrs.get('manual_name') or '').strip()
        if not product and not manual_name:
            raise serializers.ValidationError('Either product or manual_name is required.')
        if attrs.get('unit_price') is None:
            raise serializers.ValidationError('unit_price is required for project requests.')
        return attrs

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.email
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.email
        return None


class ProjectMemberScheduleSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    member_initials = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMemberSchedule
        fields = (
            'id', 'project', 'member', 'member_name', 'member_initials',
            'work_date', 'is_present', 'note', 'created_at',
        )
        read_only_fields = ('project', 'member_name', 'member_initials', 'created_at')

    def get_member_name(self, obj):
        return obj.member.get_full_name() or obj.member.email

    def get_member_initials(self, obj):
        parts = (obj.member.get_full_name() or obj.member.email).split()
        return ''.join(p[0].upper() for p in parts[:2])


class ProjectAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True, default='')
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProjectAttachment
        fields = ('id', 'project', 'file', 'file_name', 'file_size', 'url', 'uploaded_by', 'uploaded_by_name', 'created_at')
        read_only_fields = ('project', 'uploaded_by', 'created_at', 'uploaded_by_name', 'url')
        extra_kwargs = {
            'file_name': {'required': False},
            'file_size': {'required': False},
        }

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file:
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def validate(self, attrs):
        if 'file' in attrs and attrs['file']:
            f = attrs['file']
            attrs.setdefault('file_name', f.name)
            attrs.setdefault('file_size', f.size)
        return attrs

    def validate_file(self, value):
        """Reject oversized or disallowed file types."""
        MAX_BYTES = 20 * 1024 * 1024  # 20 MB
        ALLOWED_TYPES = {
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'text/csv',
            'application/zip',
        }
        if value.size > MAX_BYTES:
            raise serializers.ValidationError('File too large. Maximum size is 20 MB.')
        content_type = getattr(value, 'content_type', '')
        if content_type and content_type not in ALLOWED_TYPES:
            raise serializers.ValidationError(
                f'File type "{content_type}" is not allowed.'
            )
        return value
