#!/usr/bin/env bash
# Production server first-time setup script
# Run as root on a fresh Ubuntu 22.04 / Debian 12 server:
#   bash scripts/setup-production.sh

set -euo pipefail

APP_DIR=/opt/seasmp
APP_USER=seasmp

echo "==> Installing dependencies"
apt-get update -qq
apt-get install -y -qq curl git ufw

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null; then
  echo "==> Installing Docker Compose plugin"
  apt-get install -y docker-compose-plugin
fi

# ── Create app user ───────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  echo "==> Creating user $APP_USER"
  useradd -r -s /bin/bash -m -d "$APP_DIR" "$APP_USER"
fi
usermod -aG docker "$APP_USER"

# ── Create directory structure ────────────────────────────────────────────────
mkdir -p "$APP_DIR"/{nginx/ssl,scripts}
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── UFW firewall ──────────────────────────────────────────────────────────────
echo "==> Configuring firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
ufw --force enable

# ── .env.prod template ────────────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/.env.prod" ]]; then
  echo "==> Creating .env.prod template (fill in before deploying)"
  cat > "$APP_DIR/.env.prod" <<'ENVEOF'
POSTGRES_DB=seasmp
POSTGRES_USER=seasmp
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD

REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

JWT_SECRET=CHANGE_ME_AT_LEAST_32_CHARS_LONG
JWT_REFRESH_SECRET=CHANGE_ME_AT_LEAST_32_CHARS_LONG
JWT_EXPIRES_IN=15m
REFRESH_EXPIRES_IN=7d

API_PORT=4000
API_HOST=0.0.0.0
CORS_ORIGIN=https://your-domain.com
BCRYPT_ROUNDS=12

NEXT_PUBLIC_API_URL=https://your-domain.com/api
NEXT_PUBLIC_ANALYTICS_URL=https://your-domain.com/analytics

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=CHANGE_ME
ENVEOF
  chmod 600 "$APP_DIR/.env.prod"
fi

echo ""
echo "==> Setup complete!"
echo "    1. Edit $APP_DIR/.env.prod with real credentials"
echo "    2. Copy nginx/ssl certs to $APP_DIR/nginx/ssl/"
echo "    3. Run: bash $APP_DIR/scripts/deploy.sh"
