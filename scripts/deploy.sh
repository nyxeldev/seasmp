#!/usr/bin/env bash
# Zero-downtime deploy script
# Called by GitHub Actions CI or manually:
#   IMAGE_TAG=<sha> IMAGE_OWNER=<gh-username> bash scripts/deploy.sh

set -euo pipefail

APP_DIR=/opt/seasmp
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
ENV_FILE="$APP_DIR/.env.prod"

IMAGE_TAG=${IMAGE_TAG:-latest}
IMAGE_OWNER=${IMAGE_OWNER:-$(git config user.name 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr ' ' '-')}
REGISTRY=${REGISTRY:-ghcr.io}

export IMAGE_TAG IMAGE_OWNER REGISTRY

echo "==> Deploying tag: $IMAGE_TAG (owner: $IMAGE_OWNER)"

cd "$APP_DIR"

# ── Pull latest images ────────────────────────────────────────────────────────
echo "==> Pulling images"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

# ── Run DB migrations ─────────────────────────────────────────────────────────
echo "==> Running database migrations"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  run --rm api npx prisma migrate deploy

# ── Rolling update (one service at a time) ────────────────────────────────────
echo "==> Updating services"
for service in analytics api frontend; do
  echo "  -> $service"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    up -d --no-deps --remove-orphans "$service"
  # Wait for healthcheck to pass (up to 60s)
  timeout=60
  until docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    ps "$service" | grep -q "healthy"; do
    sleep 3
    timeout=$((timeout - 3))
    if [[ $timeout -le 0 ]]; then
      echo "ERROR: $service failed health check — rolling back"
      docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        up -d --no-deps "$service" || true
      exit 1
    fi
  done
done

# ── Reload nginx ──────────────────────────────────────────────────────────────
echo "==> Reloading nginx"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec nginx nginx -s reload || true

# ── Prune old images ──────────────────────────────────────────────────────────
echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deploy complete (tag: $IMAGE_TAG)"
