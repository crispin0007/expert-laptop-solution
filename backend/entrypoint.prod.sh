#!/bin/bash
set -e

echo "==> Running database migrations..."
python manage.py migrate --noinput

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

# Compute optimal worker count: 2 * CPU cores + 1 (Gunicorn recommendation)
# Falls back to 3 if python/multiprocessing is unavailable.
WORKERS=$(python -c 'import multiprocessing; print(2 * multiprocessing.cpu_count() + 1)' 2>/dev/null || echo 3)
echo "==> Starting Gunicorn with ${WORKERS} workers..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers "${WORKERS}" --timeout 120
