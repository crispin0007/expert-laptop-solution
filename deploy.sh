#!/usr/bin/env bash
# =============================================================================
# NEXUS BMS — Server deploy/pull script
# Usage:  ./deploy.sh [--no-build] [--force-build]
#
# Run from the repo root on the server:
#   cd ~/nexus-bms && ./deploy.sh
#
# What it does:
#   1. Pull latest code from git (main branch)
#   2. Rebuild Docker images that changed (backend + frontend)
#   3. Apply DB migrations
#   4. Collect static files
#   5. Rolling restart: celery-beat → celery → web → frontend → caddy
#   6. Print live status
# =============================================================================

set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
BRANCH="main"
NO_BUILD=false
FORCE_BUILD=false

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --no-build)    NO_BUILD=true ;;
    --force-build) FORCE_BUILD=true ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[deploy]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn() { echo -e "${YELLOW}[warn]${RESET}  $*"; }
die()  { echo -e "${RED}[error]${RESET} $*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ -f docker-compose.prod.yml ]] || die "Run this script from the repo root (~/nexus-bms)"
[[ -f .env ]]                    || die ".env file not found — copy .env.example and fill it in"
command -v docker >/dev/null     || die "docker not installed"

echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  NEXUS BMS Deploy  $(date '+%Y-%m-%d %H:%M:%S')${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"

# ── 1. Git pull ───────────────────────────────────────────────────────────────
log "Pulling latest code from origin/$BRANCH …"
BEFORE=$(git rev-parse HEAD)
git fetch --prune origin
git reset --hard "origin/$BRANCH"
AFTER=$(git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  warn "No new commits — already up to date (${AFTER:0:8})"
  CHANGED_FILES=""
else
  ok "Updated ${BEFORE:0:8} → ${AFTER:0:8}"
  CHANGED_FILES=$(git diff --name-only "$BEFORE" "$AFTER")
  echo -e "  Changed files:"
  echo "$CHANGED_FILES" | sed 's/^/    /'
fi

# ── 2. Decide what needs rebuilding ───────────────────────────────────────────
REBUILD_BACKEND=false
REBUILD_FRONTEND=false

if $FORCE_BUILD; then
  REBUILD_BACKEND=true
  REBUILD_FRONTEND=true
elif ! $NO_BUILD; then
  # Backend changes: anything under backend/, requirements.txt, or compose
  if echo "$CHANGED_FILES" | grep -qE '^backend/|^docker-compose'; then
    REBUILD_BACKEND=true
  fi
  # Frontend changes: anything under frontend/
  if echo "$CHANGED_FILES" | grep -qE '^frontend/'; then
    REBUILD_FRONTEND=true
  fi
  # If nothing changed in code but no containers are running, force build anyway
  if ! $REBUILD_BACKEND && ! $REBUILD_FRONTEND; then
    RUNNING=$($COMPOSE ps --services --filter status=running 2>/dev/null | wc -l || echo 0)
    if [[ "$RUNNING" -eq 0 ]]; then
      warn "No containers running — forcing full build"
      REBUILD_BACKEND=true
      REBUILD_FRONTEND=true
    fi
  fi
fi

# ── 3. Build changed images ───────────────────────────────────────────────────
if $REBUILD_BACKEND; then
  log "Building backend image …"
  $COMPOSE build --pull web celery celery-beat
  ok "Backend image built"
fi

if $REBUILD_FRONTEND; then
  log "Building frontend image …"
  $COMPOSE build --pull frontend
  ok "Frontend image built"
fi

if ! $REBUILD_BACKEND && ! $REBUILD_FRONTEND; then
  log "No images to rebuild — skipping build step"
fi

# ── 4. Ensure DB & Redis are up before migrate ────────────────────────────────
log "Ensuring db and redis are running …"
$COMPOSE up -d db redis
# Give postgres a moment to accept connections on cold start
sleep 3

# ── 5. Run Django migrations ──────────────────────────────────────────────────
log "Running database migrations …"
$COMPOSE run --rm --no-deps web python manage.py migrate --noinput
ok "Migrations applied"

# ── 6. Collect static files ───────────────────────────────────────────────────
log "Collecting static files …"
$COMPOSE run --rm --no-deps web python manage.py collectstatic --noinput --clear
ok "Static files collected"

# ── 7. Rolling restart ────────────────────────────────────────────────────────
log "Restarting services …"

# Beat first (lowest traffic, safe to kill)
$COMPOSE up -d --no-deps celery-beat
ok "celery-beat restarted"

# Workers
$COMPOSE up -d --no-deps celery
ok "celery restarted"

# Web (API)
$COMPOSE up -d --no-deps web
ok "web restarted"

# Frontend (static SPA container)
$COMPOSE up -d --no-deps frontend
ok "frontend restarted"

# Caddy (reverse proxy — reload config without dropping connections)
if $COMPOSE ps caddy | grep -q "running\|Up"; then
  $COMPOSE exec caddy caddy reload --config /etc/caddy/Caddyfile --force 2>/dev/null \
    && ok "caddy config reloaded" \
    || { $COMPOSE up -d --no-deps caddy && ok "caddy restarted"; }
else
  $COMPOSE up -d --no-deps caddy
  ok "caddy started"
fi

# ── 8. Health check ───────────────────────────────────────────────────────────
log "Waiting for web to become healthy (up to 30s) …"
for i in $(seq 1 15); do
  STATUS=$($COMPOSE exec -T web python manage.py check --deploy 2>&1 | tail -1 || true)
  if [[ "$STATUS" == *"System check identified no issues"* ]]; then
    ok "Django system check passed"
    break
  fi
  sleep 2
done

# ── 9. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Container status${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
$COMPOSE ps
echo ""
echo -e "${GREEN}${BOLD}  Deploy complete — commit ${AFTER:0:8}${RESET}"
echo ""
