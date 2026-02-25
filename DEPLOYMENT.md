# NEXUS BMS — Deployment Guide

## Target environment
- **Server OS**: Ubuntu 22.04 LTS
- **Domain**: `bms.techyatra.com.np` + wildcard `*.bms.techyatra.com.np`
- **Stack**: Docker + Docker Compose (prod)

---

## First-time server setup

### 1. Install dependencies
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git certbot
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # log out & back in
```

### 2. Issue SSL certificate
```bash
sudo certbot certonly --standalone \
  -d bms.techyatra.com.np \
  -d "*.bms.techyatra.com.np" \
  --agree-tos --email your@email.com
```
> Wildcard certs require DNS-01 challenge. If your DNS provider has a Certbot plugin (e.g. `certbot-dns-cloudflare`), use it. Otherwise issue manually and set up cron renewal.

Auto-renewal cron (add to `/etc/cron.d/certbot`):
```
0 3 * * * root certbot renew --quiet --post-hook "docker compose -f /srv/nexus-bms/docker-compose.prod.yml exec nginx nginx -s reload"
```

### 3. Clone the repository
```bash
sudo mkdir -p /srv/nexus-bms && sudo chown $USER: /srv/nexus-bms
git clone git@github.com:YOUR_ORG/nexus-bms.git /srv/nexus-bms
cd /srv/nexus-bms
```

### 4. Create the environment file
```bash
cp .env.example .env
nano .env          # fill in every variable
```
Key values to generate:
```bash
# Django secret key
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Random Redis password
openssl rand -hex 32
```

### 5. (Optional) Firebase credentials
Place your `serviceAccountKey.json` at the path defined in `FIREBASE_CREDENTIALS_PATH` and mount it into the `web` and `celery` services via a Docker volume or bind mount.

---

## Deploy (first time)

```bash
cd /srv/nexus-bms
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

Verify everything started:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs web | tail -30
```

### Create the Django superuser
```bash
docker compose -f docker-compose.prod.yml exec web \
  python manage.py createsuperuser
```

---

## Regular update (git-flow)

### Development workflow
```
main        ← always deployable, protected branch
feature/*   ← individual features PR'd into develop
develop     ← staging / integration branch
hotfix/*    ← cherry-picked into main + develop
```

### Zero-downtime update procedure

```bash
# 1. Pull latest code
cd /srv/nexus-bms
git pull origin main

# 2. Build new images (does not stop old containers yet)
docker compose -f docker-compose.prod.yml build web frontend celery celery-beat

# 3. Run migrations before switching traffic
docker compose -f docker-compose.prod.yml run --rm web python manage.py migrate --noinput

# 4. Collect static files
docker compose -f docker-compose.prod.yml run --rm web python manage.py collectstatic --noinput

# 5. Rolling restart (Compose re-creates containers one by one)
docker compose -f docker-compose.prod.yml up -d --no-deps web celery celery-beat frontend

# 6. Reload Nginx (picks up any config changes without dropping connections)
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

> `--no-deps` prevents Compose from restarting `db` and `redis`, so existing connections are preserved.

---

## Rollback procedure

```bash
# Find the previous image tag or commit
git log --oneline -10

# Check out previous commit
git checkout <previous-commit-hash>

# Rebuild and restart
docker compose -f docker-compose.prod.yml build web frontend
docker compose -f docker-compose.prod.yml up -d --no-deps web frontend

# If the bad deploy ran migrations you need to reverse:
docker compose -f docker-compose.prod.yml run --rm web \
  python manage.py migrate <app_name> <previous_migration_number>
```

---

## Useful operational commands

```bash
# Tail all logs
docker compose -f docker-compose.prod.yml logs -f

# Django shell
docker compose -f docker-compose.prod.yml exec web python manage.py shell

# DB backup
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup-$(date +%F).sql

# DB restore
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U $POSTGRES_USER $POSTGRES_DB

# Celery task status
docker compose -f docker-compose.prod.yml exec web \
  celery -A config inspect active
```

---

## Health checks

| URL | Expected |
|-----|----------|
| `https://bms.techyatra.com.np/health/` | `{"status": "ok"}` |
| `https://bms.techyatra.com.np/api/v1/` | 200 or 401 |
| `https://lol.bms.techyatra.com.np/api/v1/accounts/token/` | 400 (missing credentials, not 500) |

---

## Security checklist (pre-launch)

- [ ] `.env` is **not** committed to git (verify with `git status`)
- [ ] Old Gmail App Password (`mnky cnob kcur josa`) revoked at https://myaccount.google.com/apppasswords
- [ ] `DJANGO_SECRET_KEY` is ≥ 50 random characters and unique to prod
- [ ] `REDIS_PASSWORD` is set and non-empty
- [ ] `DEBUG=False` in prod settings (it is — prod.py sets this explicitly)
- [ ] SSL certificate covers both `bms.techyatra.com.np` and `*.bms.techyatra.com.np`
- [ ] Nginx HSTS header is live (verify with `curl -I https://bms.techyatra.com.np`)
- [ ] Firewall: only ports 22, 80, 443 open (`ufw allow 22 80 443 && ufw enable`)
- [ ] DB port 5432 not exposed to public (it isn't in docker-compose.prod.yml)
- [ ] Redis port 6379 not exposed to public (it isn't in docker-compose.prod.yml)

---

## Monitoring (recommended additions — not yet implemented)

- **Uptime**: UptimeRobot free tier pinging `/health/`
- **Error tracking**: Sentry (`pip install sentry-sdk`, add `DSN` env var)
- **Log shipping**: Loki + Grafana or Papertrail via Docker log driver
- **DB backups**: Automated daily `pg_dump` pushed to S3/Backblaze
