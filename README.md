NEXUS BMS — Sprint 1 scaffold

This scaffold created the initial backend Django project skeleton, Docker Compose, and a `core` app with a `TenantModel` abstract base and `TenantMiddleware`.

What's included:
- `backend/` — Django project (config) and `core` app
- Split settings: `config/settings/base.py`, `dev.py`, `prod.py`
- `docker-compose.yml` with Postgres 16 and Redis
- `backend/Dockerfile` and `.env.example`

How to run (dev):

1. Copy `.env.example` to `.env` and adjust values.
2. From repository root:

```bash
# macOS (zsh)
cp .env.example .env
docker compose up --build
```

This will build the `web` service and start Postgres and Redis. When Django is ready, visit http://localhost:8000

Next steps to continue Sprint 1:
- Implement `tenants` app and `Tenant` model (used by `TenantModel`).
- Create initial migrations and run `python manage.py migrate`.
- Add JWT auth (SimpleJWT), `TenantMixin`, and role/permission models.
- Add tests for TenantManager and middleware.
