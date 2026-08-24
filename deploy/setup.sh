#!/usr/bin/env bash
#
# First-time provisioning for an Oracle Cloud VM (Ubuntu, ARM or x86).
#
# Run once, on the VM, as a user with sudo. Safe to re-run: every step checks
# before it acts. It does not touch the database if one already exists.
#
#   sudo bash deploy/setup.sh your-name.duckdns.org
#
set -euo pipefail

HOSTNAME_ARG="${1:-}"
APP_DIR=/opt/pantry
DATA_DIR=/var/lib/pantry
ENV_FILE=/etc/pantry.env

if [[ -z "$HOSTNAME_ARG" ]]; then
  echo "Usage: sudo bash deploy/setup.sh <hostname>" >&2
  echo "  e.g. sudo bash deploy/setup.sh my-pantry.duckdns.org" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
say "Swap"
# Oracle's Always Free AMD shape has 1 GB of RAM, which is not enough to run
# the TypeScript and Vite builds — they get OOM-killed halfway through with a
# confusing error. Swap is free insurance and harmless on the 24 GB ARM shape.
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "2 GB swap added."
else
  echo "Swap already present."
fi

# ---------------------------------------------------------------------------
say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg sqlite3 debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [[ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "node $(node -v)"

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi
echo "caddy $(caddy version | head -1)"

# ---------------------------------------------------------------------------
say "Firewall"
# THE Oracle gotcha. Opening ports in the console's Security List is only half
# the job: the Ubuntu image also ships iptables rules with a REJECT at the end
# of the INPUT chain, so traffic that the cloud lets through is dropped by the
# machine itself. Every "I opened the ports and it still times out" is this.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 1 -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
    echo "opened $port"
  else
    echo "$port already open"
  fi
done
# Persist, or the rules vanish on reboot and the site dies overnight.
apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
netfilter-persistent save >/dev/null 2>&1 || iptables-save > /etc/iptables/rules.v4

# ---------------------------------------------------------------------------
say "Service account and directories"
id -u pantry >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin pantry
install -d -o pantry -g pantry -m 750 "$DATA_DIR"
install -d -o pantry -g pantry -m 755 "$APP_DIR"
install -d -o caddy -g caddy -m 755 /var/log/caddy

# ---------------------------------------------------------------------------
say "Configuration"
if [[ -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE already exists — leaving it alone."
else
  # Generated once and never printed. Regenerating it would sign out every
  # device, which is a bad surprise on a routine redeploy.
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > "$ENV_FILE" <<ENVEOF
NODE_ENV=production
PORT=4000

# The database lives outside the deploy directory on purpose: pulling a new
# version, or deleting and re-cloning it, must never be able to take your
# pantry with it.
DATABASE_URL="file:${DATA_DIR}/pantry.db"

JWT_SECRET="${SECRET}"

# One origin: Fastify serves the built frontend as well as the API.
WEB_ROOT=${APP_DIR}/web/dist
CORS_ORIGIN="https://${HOSTNAME_ARG}"

# Free USDA key: https://fdc.nal.usda.gov/api-key-signup.html
# DEMO_KEY works but is rate limited to about 30 requests an hour.
USDA_API_KEY="DEMO_KEY"
OFF_USER_AGENT="PantryToPlate/1.0 (${HOSTNAME_ARG})"
OFFLINE_MODE="false"
EXPIRY_WARNING_DAYS=3

# Never reset a real account's pantry when re-seeding to add recipes.
SEED_DEMO_USER=false
ENVEOF
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE with a freshly generated JWT secret."
fi

# ---------------------------------------------------------------------------
say "Web server"
sed "s/your-name\.duckdns\.org/${HOSTNAME_ARG}/" "$(dirname "$0")/Caddyfile" > /etc/caddy/Caddyfile
install -m 644 "$(dirname "$0")/pantry.service" /etc/systemd/system/pantry.service
systemctl daemon-reload
systemctl enable pantry >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "Done"
cat <<NEXT
Provisioned. The app is not built or running yet — that is deploy/update.sh:

  sudo bash /opt/pantry/deploy/update.sh

Before that, make sure ${HOSTNAME_ARG} points at this machine's public IP,
or Caddy cannot get a certificate.
NEXT
