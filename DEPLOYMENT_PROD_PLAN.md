# NEXUS BMS — Production Deployment Plan (Data-Safe)

This plan is designed for the currently running production stack:
- `nexus-bms-web-1`
- `nexus-bms-db-1`
- `nexus-bms-redis-1`
- `nexus-bms-frontend-1`
- `nexus-bms-celery-1`
- `nexus-bms-celery-beat-1`
- `nexus-bms-caddy-1`

It assumes deployment from repository path `/srv/nexus-bms` with `docker-compose.prod.yml`.

## 1. Pre-Deploy Checklist

Run on server:

```bash
cd /srv/nexus-bms
git fetch --all --prune
git status
docker compose -f docker-compose.prod.yml ps
```

Verify:
- Working tree is clean before pull.
- All core services are healthy/up.

## 2. Create Safety Backups (Required)

Create timestamped backup folder:

```bash
cd /srv/nexus-bms
TS="$(date +%Y%m%d_%H%M%S)"
mkdir -p backups/prod/$TS
```

### 2.1 PostgreSQL backup

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/prod/$TS/db.sql
```

### 2.2 Media + static volume backup

```bash
docker run --rm \
  -v nexus-bms_media_volume:/media \
  -v nexus-bms_static_volume:/static \
  -v "$(pwd)/backups/prod/$TS":/backup \
  alpine sh -c "tar -czf /backup/media_static.tar.gz /media /static"
```

### 2.3 Snapshot metadata

```bash
git rev-parse HEAD > backups/prod/$TS/pre_deploy_commit.txt
docker compose -f docker-compose.prod.yml images > backups/prod/$TS/pre_deploy_images.txt
```

## 3. Pull + Build New Release

```bash
cd /srv/nexus-bms
git pull origin main

# Build only app images. Keep db/redis/caddy untouched.
docker compose -f docker-compose.prod.yml build web frontend celery celery-beat
```

## 4. Run Migrations Safely Before Service Switch

```bash
cd /srv/nexus-bms
docker compose -f docker-compose.prod.yml run --rm web python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml run --rm web python manage.py collectstatic --noinput
docker compose -f docker-compose.prod.yml run --rm web python manage.py check --deploy
```

## 5. Rolling App Service Update (No DB/Redis Restart)

```bash
cd /srv/nexus-bms
docker compose -f docker-compose.prod.yml up -d --no-deps web celery celery-beat frontend
```

Do not restart these unless explicitly needed:
- `db`
- `redis`
- `caddy`

## 6. Post-Deploy Verification

```bash
cd /srv/nexus-bms
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=120 web
docker compose -f docker-compose.prod.yml logs --tail=120 celery
docker compose -f docker-compose.prod.yml logs --tail=120 celery-beat
```

API smoke checks:

```bash
curl -I https://bms.techyatra.com.np/
curl -sS https://bms.techyatra.com.np/health/
curl -sS https://bms.techyatra.com.np/api/v1/ | head
```

Business smoke checks:
- Login with admin user.
- Open Accounting -> Chart of Accounts.
- Confirm staff ledgers under `2400 Salary Payable`.
- Create/issue a test payslip in tenant `pro` and confirm accrual posts.

## 7. Rollback Procedure (Fast)

If release is unhealthy:

```bash
cd /srv/nexus-bms
git log --oneline -n 10
git checkout <previous-good-commit>
docker compose -f docker-compose.prod.yml build web frontend celery celery-beat
docker compose -f docker-compose.prod.yml up -d --no-deps web celery celery-beat frontend
```

If database migration caused incompatibility:
- Prefer forward-fix migration.
- If emergency restore is required, restore from `backups/prod/<TS>/db.sql` in a maintenance window.

## 8. One-Command Safe Deploy Script (Optional)

```bash
cd /srv/nexus-bms
TS="$(date +%Y%m%d_%H%M%S)" && mkdir -p backups/prod/$TS && \
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/prod/$TS/db.sql && \
git pull origin main && \
docker compose -f docker-compose.prod.yml build web frontend celery celery-beat && \
docker compose -f docker-compose.prod.yml run --rm web python manage.py migrate --noinput && \
docker compose -f docker-compose.prod.yml run --rm web python manage.py collectstatic --noinput && \
docker compose -f docker-compose.prod.yml up -d --no-deps web celery celery-beat frontend && \
docker compose -f docker-compose.prod.yml ps
```
