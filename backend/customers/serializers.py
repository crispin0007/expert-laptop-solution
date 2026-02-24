from rest_framework import serializers
from .models import Customer, CustomerContact


class CustomerContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerContact
        fields = ('id', 'name', 'email', 'phone', 'designation', 'is_primary')


class CustomerSerializer(serializers.ModelSerializer):
    contacts = CustomerContactSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')

    class Meta:
        model = Customer
        fields = (
            'id', 'customer_number', 'type', 'name', 'email', 'phone', 'address',
            'vat_number', 'pan_number', 'notes', 'is_active', 'is_deleted',
            'created_by', 'created_by_name', 'contacts',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'customer_number', 'is_deleted', 'created_by', 'created_by_name', 'created_at', 'updated_at')

    def _check_unique(self, qs, email, phone):
        """Return field-level errors for duplicate email/phone."""
        errors = {}
        if email and qs.filter(email__iexact=email).exists():
            errors['email'] = 'A customer with this email already exists.'
        if phone and qs.filter(phone=phone).exists():
            errors['phone'] = 'A customer with this phone number already exists.'
        return errors

    def validate(self, attrs):
        customer_type = attrs.get('type', Customer.TYPE_INDIVIDUAL)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None

        errors = {}

        # ── Required fields ──────────────────────────────────────────────────
        required_all = ['name', 'email', 'phone', 'address']
        for f in required_all:
            if not attrs.get(f, '').strip():
                errors[f] = f'{f.replace("_", " ").capitalize()} is required.'

        # Required for organizations: pan_number or vat_number
        if customer_type == Customer.TYPE_ORGANIZATION:
            if not attrs.get('pan_number', '').strip() and not attrs.get('vat_number', '').strip():
                errors['pan_number'] = 'PAN / VAT number is required for organizations.'

        if errors:
            raise serializers.ValidationError(errors)

        # ── Duplicate detection (per-tenant, skip self on update) ─────────────
        email = attrs.get('email', '').strip()
        phone = attrs.get('phone', '').strip()

        # Build base queryset — handle NULL tenant correctly (NULL != NULL in SQL)
        if tenant is not None:
            qs = Customer.objects.filter(tenant=tenant, is_deleted=False)
        else:
            qs = Customer.objects.filter(tenant__isnull=True, is_deleted=False)

        # On update, exclude the current instance
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        dup_errors = self._check_unique(qs, email, phone)
        if dup_errors:
            raise serializers.ValidationError(dup_errors)

        return attrs
