#!/usr/bin/env bash
#
# Build and (re)start the app. Run after every code change.
#
#   sudo bash /opt/pantry/deploy/update.sh            # build + restart
#   sudo bash /opt/pantry/deploy/update.sh --seed     # also load new recipes
#
# The database is never touched except by migrations, and --seed refreshes the
# shipped catalog and recipe book without going near anybody's account.
#
set -euo pipefail

APP_DIR=/opt/pantry
DATA_DIR=/var/lib/pantry
ENV_FILE=/etc/pantry.env
SEED=false

[[ "${1:-}" == "--seed" ]] && SEED=true

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ---------------------------------------------------------------------------
say "Backup"
# Before anything that could touch the schema. Cheap — the database is about a
# megabyte — and the difference between a bad migration being an inconvenience
# and being the end of your pantry.
if [[ -f "$DATA_DIR/pantry.db" ]]; then
  install -d -o pantry -g pantry -m 750 "$DATA_DIR/backups"
  STAMP=$(date +%Y%m%d-%H%M%S)
  sudo -u pantry sqlite3 "$DATA_DIR/pantry.db" ".backup '$DATA_DIR/backups/pantry-$STAMP.db'"
  # keep the last 10, so this never quietly fills the disk
  ls -1t "$DATA_DIR"/backups/pantry-*.db 2>/dev/null | tail -n +11 | xargs -r rm --
  echo "Backed up to $DATA_DIR/backups/pantry-$STAMP.db"
else
  echo "No database yet — first run."
fi

# ---------------------------------------------------------------------------
# Pull, if the code got here by git. If it got here by rsync there is nothing
# to pull and the copy on disk is already the new version.
if [[ -d "$APP_DIR/.git" ]]; then
  say "Pull"
  git -C "$APP_DIR" pull --ff-only
fi

# ---------------------------------------------------------------------------
say "Build the API"
cd "$APP_DIR/server"
npm ci --no-audit --no-fund
# Generating on the machine that will run it means Prisma picks its own engine
# binary — the reason this builds on the VM rather than being shipped prebuilt
# from a Mac, whose engine will not run on ARM Linux.
npm run build

say "Database migrations"
npx prisma migrate deploy

if [[ "$SEED" == "true" ]]; then
  say "Seeding the catalog and recipe book"
  # SEED_DEMO_USER=false comes from /etc/pantry.env: this refreshes shipped
  # recipes only, and leaves every account's pantry and diary alone.
  npm run seed
fi

# ---------------------------------------------------------------------------
say "Build the web app"
cd "$APP_DIR/web"
npm ci --no-audit --no-fund
npm run build

# ---------------------------------------------------------------------------
say "Permissions"
chown -R pantry:pantry "$DATA_DIR"
# The app only ever reads its own code; it writes exclusively to $DATA_DIR.
chown -R root:root "$APP_DIR"
chmod -R a+rX "$APP_DIR"

# ---------------------------------------------------------------------------
say "Restart"
systemctl restart pantry
sleep 3

if systemctl is-active --quiet pantry; then
  echo "Service is up."
else
  echo "Service failed to start. Last 40 lines:" >&2
  journalctl -u pantry -n 40 --no-pager >&2
  exit 1
fi

HEALTH=$(curl -fsS --max-time 10 http://localhost:4000/api/health || true)
if [[ -n "$HEALTH" ]]; then
  echo "Health: $HEALTH"
else
  echo "The service is running but /api/health did not answer." >&2
  journalctl -u pantry -n 40 --no-pager >&2
  exit 1
fi

say "Deployed"
