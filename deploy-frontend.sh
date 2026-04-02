#!/usr/bin/env bash
# deploy-frontend.sh — Build frontend locally, rsync dist/ to VPS
# Usage: ./deploy-frontend.sh [vps-host]
# Example: ./deploy-frontend.sh ubuntu@123.45.67.89
#
# Requires: node/npm locally, ssh key auth to VPS

set -euo pipefail

VPS="${1:-ubuntu@eb}"          # override: ./deploy-frontend.sh ubuntu@1.2.3.4
REMOTE_DIR="~/nexus-bms/frontend/dist"

echo "==> Building frontend locally..."
cd "$(dirname "$0")/frontend"
npm ci --silent
NODE_OPTIONS="--max-old-space-size=4096" npx vite build

echo "==> Syncing dist/ to ${VPS}:${REMOTE_DIR} ..."
rsync -avz --delete dist/ "${VPS}:${REMOTE_DIR}/"

echo "==> Done. Reloading nginx inside Docker..."
ssh "${VPS}" "docker exec nexus_bms-frontend-1 nginx -s reload 2>/dev/null || true"

echo "==> Frontend deployed."
