#!/bin/bash
# Dev entrypoint: runs migrations BEFORE starting the server.
# This prevents the recurring login 401 that happens when a new model field
# is added but the migration hasn't been applied yet — Django's ORM includes
# the new column in every SQL query, PostgreSQL throws OperationalError,
# _resolve_tenant() silently returns None, and TenantMiddleware sets
# request.tenant=None, causing TenantTokenObtainPairView to reject all
# non-superadmin logins with 401.
set -e

echo ""
echo "================================================"
echo "  NEXUS BMS  —  Dev Server"
echo "================================================"
echo ""
echo "==> Waiting for database..."
python -c "
import time, sys
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()
from django.db import connection
for i in range(30):
    try:
        connection.ensure_connection()
        print('  DB ready.')
        sys.exit(0)
    except Exception as e:
        print(f'  DB not ready yet ({e}), retrying in 2s...')
        time.sleep(2)
print('  ERROR: DB not ready after 60s — aborting.', file=sys.stderr)
sys.exit(1)
"

echo ""
echo "==> Applying pending migrations..."
python manage.py migrate --noinput

echo ""
echo "==> Checking for any remaining pending migrations..."
python manage.py migrate --check --noinput 2>&1 || {
    echo "WARNING: Some migrations could not be applied. Check above for errors."
}

echo ""
echo "==> Starting Gunicorn (dev, --reload)..."
echo ""
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --reload --timeout 120
