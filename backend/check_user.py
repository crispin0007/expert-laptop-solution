import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from django.contrib.auth import get_user_model
from accounts.models import TenantMembership

User = get_user_model()

print("=== ALL USERS ===")
for u in User.objects.all().order_by('id'):
    print(f"id={u.id} email={u.email} is_superuser={u.is_superuser} is_superadmin={u.is_superadmin} is_active={u.is_active} check_pw(Admin@12345)={u.check_password('Admin@12345')}")

print()
print("=== TENANT MEMBERSHIPS for info@techyatra.com.np ===")
try:
    u = User.objects.get(email='info@techyatra.com.np')
    for m in TenantMembership.objects.filter(user=u).select_related('tenant'):
        print(f"  tenant_slug={m.tenant.slug} role={m.role} is_active={m.is_active}")
    if not TenantMembership.objects.filter(user=u).exists():
        print("  (no memberships)")
except User.DoesNotExist:
    print("  USER NOT FOUND")

print()
print("=== THROTTLE CACHE CHECK ===")
from django.core.cache import cache
# AnonRateThrottle uses remote addr as key
keys_to_check = ['throttle_anon_127.0.0.1', 'throttle_login_127.0.0.1', 'throttle_anon_172.18.0.1']
for k in keys_to_check:
    v = cache.get(k)
    print(f"  cache[{k}] = {v}")
