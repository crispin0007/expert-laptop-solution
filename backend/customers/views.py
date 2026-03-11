from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count
from core.mixins import TenantMixin
from core.views import NexusViewSet
from core.response import ApiResponse
from core.pagination import NexusCursorPagination, NexusPageNumberPagination
from core.permissions import make_role_permission, STAFF_ROLES, MANAGER_ROLES, ALL_ROLES
from .models import Customer, CustomerContact
from .serializers import CustomerSerializer, CustomerMinimalSerializer, CustomerContactSerializer


class CustomerViewSet(NexusViewSet):
    """
    GET/POST   /api/v1/customers/        — list active / create
    GET/PUT/PATCH /api/v1/customers/{id}/ — detail / update
    DELETE     /api/v1/customers/{id}/   — soft delete (manager+)

    Query params on list:
      ?search=<term>   — case-insensitive match on name OR phone number
      ?minimal=true    — return slim id/name/phone/email payload (for dropdowns)

    Permissions:
    - read: all tenant members
    - create/update: staff+
    - delete: manager+
    """
    required_module = 'customers'
    serializer_class = CustomerSerializer
    pagination_class = NexusPageNumberPagination

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_serializer_class(self):
        # Lean serializer for dropdown / search-as-you-type use
        if self.action == 'list' and self.request.query_params.get('minimal') in ('true', '1', 'yes'):
            return CustomerMinimalSerializer
        return CustomerSerializer

    def get_queryset(self):
        self.ensure_tenant()
        qs = Customer.objects.filter(tenant=self.tenant, is_deleted=False)

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(phone__icontains=search)
            )

        ctype = self.request.query_params.get('type', '').strip()
        if ctype in ('individual', 'organization'):
            qs = qs.filter(type=ctype)

        # Bypass pagination for dropdown / minimal mode
        if self.request.query_params.get('minimal') in ('true', '1', 'yes'):
            self.pagination_class = None

        return qs.order_by('name')

    @action(detail=False, methods=['get'], url_path='geo-overview')
    def geo_overview(self, request):
        """Return nested Province > District > Municipality > Ward aggregation."""
        self.ensure_tenant()
        qs = Customer.objects.filter(tenant=self.tenant, is_deleted=False)
        total = qs.count()
        unlocated = qs.filter(province='').count()

        # Aggregate counts grouped by province, district, municipality, ward_no
        rows = (
            qs.exclude(province='')
            .values('province', 'district', 'municipality', 'ward_no')
            .annotate(count=Count('id'))
            .order_by('province', '-count')
        )

        # Province label map from model choices
        province_labels = dict(Customer.PROVINCE_CHOICES)

        # Build nested structure
        provinces: dict = {}
        for row in rows:
            prov_key = row['province']
            dist = row['district'] or 'Unknown District'
            muni = row['municipality'] or 'Unknown Municipality'
            ward = row['ward_no'] or 'Unknown'
            cnt = row['count']

            if prov_key not in provinces:
                provinces[prov_key] = {
                    'province': prov_key,
                    'province_label': province_labels.get(prov_key, prov_key.title()),
                    'count': 0,
                    'districts': {},
                }
            p = provinces[prov_key]
            p['count'] += cnt

            if dist not in p['districts']:
                p['districts'][dist] = {'district': dist, 'count': 0, 'municipalities': {}}
            d = p['districts'][dist]
            d['count'] += cnt

            if muni not in d['municipalities']:
                d['municipalities'][muni] = {'municipality': muni, 'count': 0, 'wards': {}}
            m = d['municipalities'][muni]
            m['count'] += cnt

            if ward not in m['wards']:
                m['wards'][ward] = {'ward': ward, 'count': 0}
            m['wards'][ward]['count'] += cnt

        # Flatten dicts to sorted lists
        def flatten(prov_dict):
            out = []
            for p in sorted(prov_dict.values(), key=lambda x: -x['count']):
                districts = []
                for d in sorted(p['districts'].values(), key=lambda x: -x['count']):
                    municipalities = []
                    for m in sorted(d['municipalities'].values(), key=lambda x: -x['count']):
                        wards = sorted(m['wards'].values(), key=lambda x: -x['count'])
                        municipalities.append({
                            'municipality': m['municipality'],
                            'count': m['count'],
                            'wards': wards,
                        })
                    districts.append({
                        'district': d['district'],
                        'count': d['count'],
                        'municipalities': municipalities,
                    })
                out.append({
                    'province': p['province'],
                    'province_label': p['province_label'],
                    'count': p['count'],
                    'districts': districts,
                })
            return out

        return ApiResponse.success(data={
            'total': total,
            'unlocated': unlocated,
            'provinces': flatten(provinces),
        })

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(
            tenant=self.tenant,
            created_by=self.request.user,
            is_active=True,
        )
        return ApiResponse.created(data=self.get_serializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        customer = self.get_object()
        customer.soft_delete()
        return ApiResponse.no_content()


class CustomerContactViewSet(NexusViewSet):
    """Contacts inherit the parent customer's permission level."""

    required_module = 'customers'
    serializer_class = CustomerContactSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        # Scope contacts to the parent customer AND the current tenant to prevent
        # a user from probing contacts across tenants by guessing customer_pk.
        return CustomerContact.objects.filter(
            customer_id=self.kwargs['customer_pk'],
            customer__tenant=self.tenant,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(customer_id=self.kwargs['customer_pk'])
        return ApiResponse.created(data=self.get_serializer(instance).data)
