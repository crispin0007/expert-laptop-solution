#!/usr/bin/env bash

# NEXUS BMS production-safe automated deploy
#
# What it does:
# 1) Optional DB + config backups
# 2) Fast-forward pull from remote branch
# 3) Selective image build (backend/frontend) or force build
# 4) Migrate + collectstatic
# 5) Rolling restart (no db/redis restart)
# 6) Optional health URL check
#
# Usage examples:
#   ./deploy-production-auto.sh
#   ./deploy-production-auto.sh --force-build
#   ./deploy-production-auto.sh --skip-build
#   ./deploy-production-auto.sh --health-url "https://bms.techyatra.com.np/health/"

set -Eeuo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
BRANCH="main"
BACKUP_DIR="./backups"

SKIP_BUILD=false
FORCE_BUILD=false
NO_BACKUP=false
SKIP_PULL=false
HEALTH_URL=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log()  { echo -e "${CYAN}[deploy]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn() { echo -e "${YELLOW}[warn]${RESET}  $*"; }
die()  { echo -e "${RED}[error]${RESET} $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
NEXUS BMS production automated deploy

Options:
  --branch <name>        Git branch to deploy (default: main)
  --skip-build           Skip docker build step
  --force-build          Force rebuild backend + frontend images
  --no-backup            Skip DB/.env/compose backups
  --skip-pull            Skip git fetch/pull (deploy current checkout)
  --health-url <url>     Check this URL after deploy (curl -fsS)
  --help                 Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"; shift 2 ;;
    --skip-build)
      SKIP_BUILD=true; shift ;;
    --force-build)
      FORCE_BUILD=true; shift ;;
    --no-backup)
      NO_BACKUP=true; shift ;;
    --skip-pull)
      SKIP_PULL=true; shift ;;
    --health-url)
      HEALTH_URL="${2:-}"; shift 2 ;;
    --help)
      usage; exit 0 ;;
    *)
      die "Unknown option: $1" ;;
  esac
done

[[ -f "${COMPOSE_FILE}" ]] || die "Run this from repo root containing ${COMPOSE_FILE}."
[[ -f ".env" ]] || die ".env not found."
command -v docker >/dev/null || die "docker not installed"
command -v git >/dev/null || die "git not installed"

echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  NEXUS BMS Production Deploy${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"

TS="$(date +%F_%H%M%S)"
BEFORE_COMMIT="$(git rev-parse --short HEAD)"

on_error() {
  local exit_code=$?
  echo
  echo -e "${RED}${BOLD}Deploy failed (exit ${exit_code}).${RESET}"
  echo -e "${YELLOW}Rollback hints:${RESET}"
  echo "  1) git checkout ${BEFORE_COMMIT}"
  echo "  2) ${COMPOSE} build web celery celery-beat frontend"
  echo "  3) ${COMPOSE} up -d --no-deps web celery celery-beat frontend"
  if [[ -n "${DB_BACKUP_FILE:-}" ]]; then
    echo "  4) DB backup created at: ${DB_BACKUP_FILE}"
  fi
}
trap on_error ERR

log "Ensuring db and redis are running..."
${COMPOSE} up -d db redis

if ! ${NO_BACKUP}; then
  log "Creating DB and config backups..."
  mkdir -p "${BACKUP_DIR}"

  # shellcheck disable=SC1091
  set -a; source .env; set +a
  : "${POSTGRES_USER:?POSTGRES_USER is required in .env}"
  : "${POSTGRES_DB:?POSTGRES_DB is required in .env}"

  DB_BACKUP_FILE="${BACKUP_DIR}/db_${TS}.sql"
  ${COMPOSE} exec -T db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${DB_BACKUP_FILE}"
  cp .env "${BACKUP_DIR}/.env_${TS}"
  cp "${COMPOSE_FILE}" "${BACKUP_DIR}/${COMPOSE_FILE}_${TS}"
  ok "Backup complete: ${DB_BACKUP_FILE}"
fi

if ! ${SKIP_PULL}; then
  log "Fetching and fast-forwarding to origin/${BRANCH}..."
  git fetch --prune origin
  git pull --ff-only origin "${BRANCH}"
else
  warn "Skipping git pull; deploying current checkout."
fi

AFTER_COMMIT="$(git rev-parse --short HEAD)"
CHANGED_FILES=""
if [[ "${BEFORE_COMMIT}" != "${AFTER_COMMIT}" ]]; then
  CHANGED_FILES="$(git diff --name-only "${BEFORE_COMMIT}" "${AFTER_COMMIT}")"
  ok "Code updated ${BEFORE_COMMIT} -> ${AFTER_COMMIT}"
else
  warn "No new commit pulled; proceeding with current code (${AFTER_COMMIT})."
fi

REBUILD_BACKEND=false
REBUILD_FRONTEND=false

if ${FORCE_BUILD}; then
  REBUILD_BACKEND=true
  REBUILD_FRONTEND=true
elif ! ${SKIP_BUILD}; then
  if echo "${CHANGED_FILES}" | grep -qE '^backend/|^docker-compose'; then
    REBUILD_BACKEND=true
  fi
  if echo "${CHANGED_FILES}" | grep -qE '^frontend/'; then
    REBUILD_FRONTEND=true
  fi

  # If unsure (no changes detected), still keep a safe default: no rebuild.
  # User can force with --force-build.
fi

if ! ${SKIP_BUILD}; then
  if ${REBUILD_BACKEND}; then
    log "Building backend images..."
    ${COMPOSE} build --pull web celery celery-beat
    ok "Backend images built"
  fi

  if ${REBUILD_FRONTEND}; then
    log "Building frontend image..."
    ${COMPOSE} build --pull frontend
    ok "Frontend image built"
  fi

  if ! ${REBUILD_BACKEND} && ! ${REBUILD_FRONTEND}; then
    warn "No image rebuild needed (use --force-build to rebuild anyway)."
  fi
else
  warn "Skipping build step by flag."
fi

log "Running migration plan..."
${COMPOSE} run --rm --no-deps web python manage.py migrate --plan

log "Applying migrations..."
${COMPOSE} run --rm --no-deps web python manage.py migrate --noinput
ok "Migrations applied"

log "Collecting static files..."
${COMPOSE} run --rm --no-deps web python manage.py collectstatic --noinput
ok "Static collected"

log "Rolling restart without db/redis interruption..."

if ${REBUILD_BACKEND}; then
  ${COMPOSE} up -d --no-deps --force-recreate celery-beat
  ${COMPOSE} up -d --no-deps --force-recreate celery
  ${COMPOSE} up -d --no-deps --force-recreate web
else
  ${COMPOSE} up -d --no-deps celery-beat
  ${COMPOSE} up -d --no-deps celery
  ${COMPOSE} up -d --no-deps web
fi
ok "Backend services restarted"

if ${REBUILD_FRONTEND}; then
  ${COMPOSE} up -d --no-deps --force-recreate frontend
else
  ${COMPOSE} up -d --no-deps frontend
fi
ok "Frontend service restarted"

if ${COMPOSE} ps caddy | grep -qE "running|Up"; then
  ${COMPOSE} exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force || ${COMPOSE} up -d --no-deps caddy
else
  ${COMPOSE} up -d --no-deps caddy
fi
ok "Caddy reloaded"

log "Running Django system checks..."
${COMPOSE} exec -T web python manage.py check
ok "Django checks passed"

if [[ -n "${HEALTH_URL}" ]]; then
  log "Checking health URL: ${HEALTH_URL}"
  curl -fsS "${HEALTH_URL}" >/dev/null
  ok "Health URL reachable"
fi

echo
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Deploy Summary${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo "Commit: ${AFTER_COMMIT}"
${COMPOSE} ps

if [[ -n "${DB_BACKUP_FILE:-}" ]]; then
  echo "DB backup: ${DB_BACKUP_FILE}"
fi

echo
ok "Production deploy completed successfully"
