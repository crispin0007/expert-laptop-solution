from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import serializers
from core.serializers import NepaliModelSerializer
from .models import (
    Vehicle, VehicleLog,
    Ticket, TicketType, TicketComment, TicketTransfer,
    TicketProduct, TicketSLA, TicketTimeline, TicketAttachment,
    TicketCategory, TicketSubCategory,
)

User = get_user_model()


def _user_display_name(user) -> str:
    """Best available display name. Priority: full_name -> first+last -> username -> email local-part."""
    if not user:
        return ''
    if user.full_name:
        return user.full_name
    composed = f"{user.first_name} {user.last_name}".strip()
    if composed:
        return composed
    if user.username and user.username != user.email:
        return user.username
    # Last resort: email local part (before @) - friendlier than full email
    local = user.email.split('@')[0] if user.email and '@' in user.email else user.email
    return local or user.email


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
            'is_active', 'has_brand_model', 'subcategories', 'created_at', 'updated_at',
        )
        read_only_fields = ('slug', 'created_at', 'updated_at')


class TicketCategoryWriteSerializer(serializers.ModelSerializer):
    """Write serializer (no nested subcategories)."""
    class Meta:
        model = TicketCategory
        fields = ('id', 'name', 'description', 'color', 'icon', 'is_active', 'has_brand_model')


# ── TicketType ────────────────────────────────────────────────────────────────

class TicketTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketType
        fields = (
            'id', 'name', 'slug', 'default_sla_hours', 'color', 'icon',
            'requires_product', 'is_active',
            'is_free_service', 'coin_service_rate', 'coin_product_rate',
            'created_at', 'updated_at',
        )
        read_only_fields = ('slug', 'created_at', 'updated_at')


# ── Ticket (read) ─────────────────────────────────────────────────────────────

class TicketSerializer(NepaliModelSerializer):
    """Full read serializer — includes human-readable names for FK fields."""
    ticket_type_name   = serializers.CharField(source='ticket_type.name',        read_only=True, default='')
    customer_name      = serializers.CharField(source='customer.name',            read_only=True, default='')
    customer_phone     = serializers.CharField(source='customer.phone',           read_only=True, default='')
    customer_email     = serializers.CharField(source='customer.email',           read_only=True, default='')
    department_name    = serializers.CharField(source='department.name',          read_only=True, default='')
    assigned_to_name   = serializers.SerializerMethodField()
    created_by_name    = serializers.SerializerMethodField()
    category_name      = serializers.CharField(source='category.name',            read_only=True, default='')
    subcategory_name   = serializers.CharField(source='subcategory.name',         read_only=True, default='')
    sla_breached       = serializers.SerializerMethodField()
    sla_breach_at      = serializers.SerializerMethodField()
    team_members       = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    team_member_names  = serializers.SerializerMethodField()
    vehicles           = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    vehicle_names      = serializers.SerializerMethodField()
    coin_preview            = serializers.SerializerMethodField()
    coin_transaction_status = serializers.SerializerMethodField()

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
            'device_brand', 'device_model',
            'status', 'priority',
            'assigned_to', 'assigned_to_name',
            'team_members', 'team_member_names',
            'vehicles', 'vehicle_names',
            'created_by', 'created_by_name',
            'parent_ticket',
            'sla_deadline', 'sla_breached', 'sla_breach_at',
            'resolved_at', 'closed_at',
            'service_charge',
            'coin_preview',
            'coin_transaction_status',
            'is_deleted',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'ticket_number', 'created_by', 'resolved_at', 'closed_at',
            'is_deleted', 'created_at', 'updated_at',
        )

    @staticmethod
    def _user_display_name(user):
        return _user_display_name(user)

    def get_assigned_to_name(self, obj):
        return self._user_display_name(obj.assigned_to)

    def get_created_by_name(self, obj):
        return self._user_display_name(obj.created_by)

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
        return [self._user_display_name(u) for u in obj.team_members.all()]

    def get_vehicle_names(self, obj):
        return [{'id': v.id, 'name': v.name, 'plate_number': v.plate_number} for v in obj.vehicles.all()]

    def get_coin_preview(self, obj):
        """
        Pre-computed coin breakdown for the close-ticket modal.
        Included in every ticket response so the UI never needs a second request.
        Returns None when ticket_type is not set.
        """
        try:
            from tickets.services.ticket_service import calculate_ticket_coins_from_ticket
            _, breakdown = calculate_ticket_coins_from_ticket(obj)
            return breakdown
        except Exception:
            return None

    def get_coin_transaction_status(self, obj):
        """
        Returns the status of the CoinTransaction linked to this ticket,
        or None if no coin transaction has been created yet.
        Values: 'pending' | 'approved' | 'rejected' | None
        """
        try:
            from accounting.models import CoinTransaction
            txn = (
                CoinTransaction.objects
                .filter(
                    tenant=obj.tenant,
                    source_type=CoinTransaction.SOURCE_TICKET,
                    source_id=obj.pk,
                )
                .values('status')
                .first()
            )
            return txn['status'] if txn else None
        except Exception:
            return None


# ── Ticket (create / update) ──────────────────────────────────────────────────

class TicketCreateSerializer(NepaliModelSerializer):
    """Write serializer — computes SLA deadline on creation."""
    team_members = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        required=False,
    )
    vehicles = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Vehicle.objects.all(),
        required=False,
    )
    # Title is optional — auto-generated from category+subcategory if omitted
    title = serializers.CharField(required=False, allow_blank=True, max_length=255)

    class Meta:
        model = Ticket
        fields = (
            'ticket_type', 'customer', 'department',
            'category', 'subcategory',
            'title', 'description', 'contact_phone',
            'device_brand', 'device_model',
            'priority',
            'assigned_to', 'parent_ticket', 'team_members', 'vehicles',
        )

    def validate_team_members(self, users):
        """
        Reject any user who is not an active member of the current tenant.

        Without this guard, a caller could pass arbitrary user PKs from other
        tenants and silently assign cross-tenant users as co-assignees.
        The ``assign`` action on TicketViewSet already enforces this; here we
        close the same gap on ``create`` / ``update`` paths.
        """
        if not users:
            return users
        tenant = self.context.get('tenant')
        if not tenant:
            return users  # tenant-less context (tests/admin) — defer to view layer
        from accounts.models import TenantMembership
        member_ids = set(
            TenantMembership.objects.filter(
                user__in=users, tenant=tenant, is_active=True,
            ).values_list('user_id', flat=True)
        )
        invalid = [u for u in users if u.pk not in member_ids]
        if invalid:
            emails = [u.email for u in invalid]
            raise serializers.ValidationError(
                f"These users are not active members of this workspace: {emails}"
            )
        return users

    def _build_auto_title(self, validated_data):
        """Build a title from category + subcategory if not supplied."""
        category    = validated_data.get('category')
        subcategory = validated_data.get('subcategory')
        if category and subcategory:
            return f"{category.name} — {subcategory.name}"
        if category:
            return f"{category.name} Request"
        ticket_type = validated_data.get('ticket_type')
        if ticket_type:
            return f"{ticket_type.name} Ticket"
        return "Support Request"

    def create(self, validated_data):
        tenant = self.context['tenant']
        user   = self.context['request'].user
        team_members = validated_data.pop('team_members', [])
        vehicles     = validated_data.pop('vehicles', [])

        # Auto-generate title when not provided or left blank
        if not validated_data.get('title', '').strip():
            validated_data['title'] = self._build_auto_title(validated_data)

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
            description=f"Ticket created by {_user_display_name(user)}",
            actor=user,
            created_by=user,
        )
        if team_members:
            ticket.team_members.set(team_members)
        if vehicles:
            ticket.vehicles.set(vehicles)
        return ticket

    def update(self, instance, validated_data):
        team_members = validated_data.pop('team_members', None)
        instance = super().update(instance, validated_data)
        if team_members is not None:
            instance.team_members.set(team_members)
        return instance


# ── SLA ───────────────────────────────────────────────────────────────────────

class TicketSLASerializer(NepaliModelSerializer):
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
    author_name   = serializers.SerializerMethodField()
    author_email  = serializers.CharField(source='author.email',     read_only=True, default='')
    attachments   = serializers.JSONField(source='attachment_files', default=list)
    # Write-only override accepted on create; ignored on display (get_author_name handles it)
    author_override = serializers.CharField(required=False, allow_blank=True, max_length=128, write_only=False)

    def get_author_name(self, obj):
        # Prefer explicit override (migration / legacy data), fall back to NEXUS user
        if getattr(obj, 'author_override', ''):
            return obj.author_override
        return _user_display_name(obj.author)

    class Meta:
        model = TicketComment
        fields = (
            'id', 'ticket', 'author', 'author_name', 'author_email',
            'body', 'is_internal', 'attachments', 'author_override', 'created_at',
        )
        read_only_fields = ('ticket', 'author', 'author_name', 'author_email', 'created_at')


# ── Transfer ──────────────────────────────────────────────────────────────────

class TicketTransferSerializer(serializers.ModelSerializer):
    from_department_name = serializers.CharField(source='from_department.name', read_only=True, default='')
    to_department_name   = serializers.CharField(source='to_department.name',   read_only=True, default='')
    transferred_by_name  = serializers.SerializerMethodField()

    def get_transferred_by_name(self, obj):
        return _user_display_name(obj.transferred_by)

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
    product_name         = serializers.CharField(source='product.name',                  read_only=True, default='')
    serial_number_display = serializers.CharField(source='serial_number.serial_number', read_only=True, default=None, allow_null=True)
    line_total           = serializers.SerializerMethodField()

    class Meta:
        model = TicketProduct
        fields = (
            'id', 'ticket', 'product', 'product_name',
            'quantity', 'unit_price', 'discount', 'line_total',
            'serial_number', 'serial_number_display',
            'created_at',
        )
        read_only_fields = ('ticket', 'created_at', 'serial_number_display')
        extra_kwargs = {
            'unit_price': {'required': False},
            'discount': {'required': False},
        }

    def get_line_total(self, obj):
        """
        Return the line total after applying the percentage discount.

        ``discount`` is stored as a percentage (0–100), e.g. 10 means 10% off.
        Formula: qty × unit_price × (1 − discount / 100)

        This matches:
          • ticket_invoice_service.calculate_ticket_coins
          • accounting.services.invoice_service.compute_invoice_totals
        so the value displayed on the ticket panel is always consistent with
        what appears on the generated invoice.
        """
        from decimal import Decimal
        qty      = Decimal(str(obj.quantity or 1))
        price    = obj.unit_price or Decimal('0')
        disc_pct = obj.discount or Decimal('0')          # percentage, e.g. 10 = 10 %
        subtotal        = price * qty
        discount_amount = subtotal * (disc_pct / Decimal('100'))
        return str((subtotal - discount_amount).quantize(Decimal('0.01')))

    def validate(self, attrs):
        """Auto-snapshot unit_price from the product if not supplied."""
        if not attrs.get('unit_price') and attrs.get('product'):
            attrs['unit_price'] = attrs['product'].unit_price
        return attrs


# ── Timeline ──────────────────────────────────────────────────────────────────

class TicketTimelineSerializer(serializers.ModelSerializer):
    actor_name  = serializers.SerializerMethodField()
    actor_email = serializers.CharField(source='actor.email',     read_only=True, default='')

    def get_actor_name(self, obj):
        return _user_display_name(obj.actor)

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
    uploaded_by_name = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    def get_uploaded_by_name(self, obj):
        return _user_display_name(obj.uploaded_by)

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


# ── Vehicle serializers ───────────────────────────────────────────────────────

class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = (
            'id', 'name', 'plate_number', 'type', 'fuel_type',
            'rate_per_km', 'notes', 'is_active',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class VehicleLogSerializer(serializers.ModelSerializer):
    vehicle_name   = serializers.CharField(source='vehicle.name', read_only=True)
    ticket_number  = serializers.CharField(source='ticket.ticket_number', read_only=True, default='')
    driven_by_name = serializers.SerializerMethodField()
    distance_km    = serializers.SerializerMethodField()
    billing_amount = serializers.SerializerMethodField()

    def get_driven_by_name(self, obj):
        return _user_display_name(obj.driven_by)

    class Meta:
        model = VehicleLog
        fields = (
            'id',
            'vehicle', 'vehicle_name',
            'ticket', 'ticket_number',
            'driven_by', 'driven_by_name',
            'date',
            'odometer_start', 'odometer_end',
            'distance_km', 'billing_amount',
            'fuel_liters', 'fuel_cost',
            'notes',
            'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_distance_km(self, obj):
        return obj.distance_km

    def get_billing_amount(self, obj):
        return obj.billing_amount
