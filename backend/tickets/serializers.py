from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import (
    Ticket, TicketType, TicketComment, TicketTransfer,
    TicketProduct, TicketSLA, TicketTimeline, TicketAttachment,
    TicketCategory, TicketSubCategory,
)

User = get_user_model()


# ── TicketCategory ────────────────────────────────────────────────────────────

class TicketSubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketSubCategory
        fields = ('id', 'category', 'name', 'slug', 'is_active', 'created_at')
        read_only_fields = ('slug', 'created_at')


class TicketCategorySerializer(serializers.ModelSerializer):
    """Full category serializer with nested subcategories (read-only list)."""
    subcategories = TicketSubCategorySerializer(many=True, read_only=True)

    class Meta:
        model = TicketCategory
        fields = (
            'id', 'name', 'slug', 'description', 'color', 'icon',
            'is_active', 'subcategories', 'created_at', 'updated_at',
        )
        read_only_fields = ('slug', 'created_at', 'updated_at')


class TicketCategoryWriteSerializer(serializers.ModelSerializer):
    """Write serializer (no nested subcategories)."""
    class Meta:
        model = TicketCategory
        fields = ('id', 'name', 'description', 'color', 'icon', 'is_active')


# ── TicketType ────────────────────────────────────────────────────────────────

class TicketTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketType
        fields = (
            'id', 'name', 'slug', 'default_sla_hours', 'color', 'icon',
            'requires_product', 'is_active', 'created_at', 'updated_at',
        )
        read_only_fields = ('slug', 'created_at', 'updated_at')


# ── Ticket (read) ─────────────────────────────────────────────────────────────

class TicketSerializer(serializers.ModelSerializer):
    """Full read serializer — includes human-readable names for FK fields."""
    ticket_type_name   = serializers.CharField(source='ticket_type.name',        read_only=True, default='')
    customer_name      = serializers.CharField(source='customer.name',            read_only=True, default='')
    customer_phone     = serializers.CharField(source='customer.phone',           read_only=True, default='')
    customer_email     = serializers.CharField(source='customer.email',           read_only=True, default='')
    department_name    = serializers.CharField(source='department.name',          read_only=True, default='')
    assigned_to_name   = serializers.CharField(source='assigned_to.full_name',    read_only=True, default='')
    created_by_name    = serializers.CharField(source='created_by.full_name',     read_only=True, default='')
    category_name      = serializers.CharField(source='category.name',            read_only=True, default='')
    subcategory_name   = serializers.CharField(source='subcategory.name',         read_only=True, default='')
    sla_breached       = serializers.SerializerMethodField()
    sla_breach_at      = serializers.SerializerMethodField()
    team_members       = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    team_member_names  = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = (
            'id', 'ticket_number',
            'ticket_type', 'ticket_type_name',
            'customer', 'customer_name', 'customer_phone', 'customer_email',
            'department', 'department_name',
            'category', 'category_name',
            'subcategory', 'subcategory_name',
            'title', 'description', 'contact_phone',
            'status', 'priority',
            'assigned_to', 'assigned_to_name',
            'team_members', 'team_member_names',
            'created_by', 'created_by_name',
            'parent_ticket',
            'sla_deadline', 'sla_breached', 'sla_breach_at',
            'resolved_at', 'closed_at',
            'is_deleted',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'ticket_number', 'created_by', 'resolved_at', 'closed_at',
            'is_deleted', 'created_at', 'updated_at',
        )

    def get_sla_breached(self, obj):
        try:
            return obj.sla.breached
        except Exception:
            return False

    def get_sla_breach_at(self, obj):
        try:
            return obj.sla.breach_at
        except Exception:
            return None

    def get_team_member_names(self, obj):
        return [u.full_name or u.email for u in obj.team_members.all()]


# ── Ticket (create / update) ──────────────────────────────────────────────────

class TicketCreateSerializer(serializers.ModelSerializer):
    """Write serializer — computes SLA deadline on creation."""
    team_members = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        required=False,
    )

    class Meta:
        model = Ticket
        fields = (
            'ticket_type', 'customer', 'department',
            'category', 'subcategory',
            'title', 'description', 'contact_phone', 'priority',
            'assigned_to', 'parent_ticket', 'team_members',
        )

    def create(self, validated_data):
        tenant = self.context['tenant']
        user   = self.context['request'].user
        team_members = validated_data.pop('team_members', [])

        ticket_type = validated_data.get('ticket_type')
        sla_hours   = ticket_type.default_sla_hours if ticket_type else 24
        sla_deadline = timezone.now() + timezone.timedelta(hours=sla_hours)

        ticket = Ticket.objects.create(
            tenant=tenant,
            created_by=user,
            sla_deadline=sla_deadline,
            **validated_data,
        )

        # Auto-create SLA record
        TicketSLA.objects.create(
            tenant=tenant,
            ticket=ticket,
            sla_hours=sla_hours,
            breach_at=sla_deadline,
            created_by=user,
        )

        # Timeline — created event
        TicketTimeline.objects.create(
            tenant=tenant,
            ticket=ticket,
            event_type=TicketTimeline.EVENT_CREATED,
            description=f"Ticket created by {user.full_name or user.email}",
            actor=user,
            created_by=user,
        )
        if team_members:
            ticket.team_members.set(team_members)
        return ticket

    def update(self, instance, validated_data):
        team_members = validated_data.pop('team_members', None)
        instance = super().update(instance, validated_data)
        if team_members is not None:
            instance.team_members.set(team_members)
        return instance


# ── SLA ───────────────────────────────────────────────────────────────────────

class TicketSLASerializer(serializers.ModelSerializer):
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True)
    ticket_title  = serializers.CharField(source='ticket.title',         read_only=True)

    class Meta:
        model = TicketSLA
        fields = (
            'id', 'ticket', 'ticket_number', 'ticket_title',
            'sla_hours', 'breach_at', 'breached', 'breached_at',
            'warning_sent_at', 'notified',
        )
        read_only_fields = fields


# ── Comment ───────────────────────────────────────────────────────────────────

class TicketCommentSerializer(serializers.ModelSerializer):
    author_name   = serializers.CharField(source='author.full_name', read_only=True, default='')
    author_email  = serializers.CharField(source='author.email',     read_only=True, default='')
    attachments   = serializers.JSONField(source='attachment_files', default=list)

    class Meta:
        model = TicketComment
        fields = (
            'id', 'ticket', 'author', 'author_name', 'author_email',
            'body', 'is_internal', 'attachments', 'created_at',
        )
        read_only_fields = ('ticket', 'author', 'author_name', 'author_email', 'created_at')


# ── Transfer ──────────────────────────────────────────────────────────────────

class TicketTransferSerializer(serializers.ModelSerializer):
    from_department_name = serializers.CharField(source='from_department.name', read_only=True, default='')
    to_department_name   = serializers.CharField(source='to_department.name',   read_only=True, default='')
    transferred_by_name  = serializers.CharField(source='transferred_by.full_name', read_only=True, default='')

    class Meta:
        model = TicketTransfer
        fields = (
            'id', 'ticket',
            'from_department', 'from_department_name',
            'to_department', 'to_department_name',
            'transferred_by', 'transferred_by_name',
            'reason', 'created_at',
        )
        read_only_fields = ('transferred_by', 'from_department', 'created_at')


# ── Product ───────────────────────────────────────────────────────────────────

class TicketProductSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, default='')
    line_total   = serializers.SerializerMethodField()

    class Meta:
        model = TicketProduct
        fields = (
            'id', 'ticket', 'product', 'product_name',
            'quantity', 'unit_price', 'discount', 'line_total', 'created_at',
        )
        read_only_fields = ('ticket', 'created_at')
        extra_kwargs = {
            'unit_price': {'required': False},
            'discount': {'required': False},
        }

    def get_line_total(self, obj):
        from decimal import Decimal
        qty = obj.quantity or 1
        price = obj.unit_price or Decimal('0')
        disc = obj.discount or Decimal('0')
        return str((price * qty) - disc)

    def validate(self, attrs):
        """Auto-snapshot unit_price from the product if not supplied."""
        if not attrs.get('unit_price') and attrs.get('product'):
            attrs['unit_price'] = attrs['product'].unit_price
        return attrs


# ── Timeline ──────────────────────────────────────────────────────────────────

class TicketTimelineSerializer(serializers.ModelSerializer):
    actor_name  = serializers.CharField(source='actor.full_name', read_only=True, default='')
    actor_email = serializers.CharField(source='actor.email',     read_only=True, default='')

    class Meta:
        model = TicketTimeline
        fields = (
            'id', 'event_type', 'description',
            'actor', 'actor_name', 'actor_email',
            'metadata', 'created_at',
        )
        read_only_fields = fields


# ── Attachment ────────────────────────────────────────────────────────────────

class TicketAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True, default='')
    url = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = (
            'id', 'ticket', 'comment',
            'file', 'file_url', 'file_name', 'file_size',
            'url', 'uploaded_by', 'uploaded_by_name', 'created_at',
        )
        read_only_fields = ('ticket', 'comment', 'uploaded_by', 'created_at', 'uploaded_by_name', 'url')
        extra_kwargs = {
            'file_name': {'required': False},
            'file_size': {'required': False},
            'file_url': {'required': False},
        }

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file:
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return obj.file_url or None

    def validate(self, attrs):
        if 'file' in attrs and attrs['file']:
            f = attrs['file']
            attrs.setdefault('file_name', f.name)
            attrs.setdefault('file_size', f.size)
        return attrs
