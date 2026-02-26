from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Project, ProjectMilestone, ProjectTask, ProjectProduct, ProjectAttachment, ProjectProductRequest

User = get_user_model()


class ProjectMilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectMilestone
        fields = ('id', 'project', 'name', 'due_date', 'is_completed', 'completed_at', 'created_at')
        read_only_fields = ('project', 'completed_at', 'created_at')


class ProjectTaskSerializer(serializers.ModelSerializer):
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
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_price = serializers.CharField(source='product.unit_price', read_only=True)
    is_service = serializers.BooleanField(source='product.is_service', read_only=True)

    class Meta:
        model = ProjectProduct
        fields = ('id', 'project', 'product', 'product_name', 'unit_price', 'is_service',
                  'quantity_planned', 'note')
        read_only_fields = ('project', 'product_name', 'unit_price', 'is_service')


class ProjectSerializer(serializers.ModelSerializer):
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

    def get_tasks_count(self, obj):
        return obj.tasks.count()

    def get_done_tasks_count(self, obj):
        return obj.tasks.filter(status=ProjectTask.STATUS_DONE).count()

    def get_manager_name(self, obj):
        if obj.manager:
            return obj.manager.get_full_name() or obj.manager.email
        return None

    def get_team_member_names(self, obj):
        return [u.get_full_name() or u.email for u in obj.team_members.all()]

    def create(self, validated_data):
        team_members = validated_data.pop('team_members', [])
        project = super().create(validated_data)
        if team_members:
            project.team_members.set(team_members)
        return project

    def update(self, instance, validated_data):
        team_members = validated_data.pop('team_members', None)
        instance = super().update(instance, validated_data)
        if team_members is not None:
            instance.team_members.set(team_members)
        return instance


class ProjectProductRequestSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectProductRequest
        fields = (
            'id', 'project', 'product', 'product_name', 'product_sku',
            'quantity', 'note', 'status',
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

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.email
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.email
        return None


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
