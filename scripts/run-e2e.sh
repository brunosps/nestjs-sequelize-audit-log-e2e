#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PORT="${APP_PORT:-3100}"
LOAD_RATE="${LOAD_RATE:-10}"
LOAD_DURATION="${LOAD_DURATION:-600}"
ARCHIVE_SETTLE_SECONDS="${ARCHIVE_SETTLE_SECONDS:-20}"
PACKAGE_FILE="$ROOT_DIR/vendor/nestjs-sequelize-audit-log-1.3.0.tgz"

cd "$ROOT_DIR"
mkdir -p artifacts

if [ ! -f "$PACKAGE_FILE" ]; then
  echo "Missing package tarball: $PACKAGE_FILE"
  echo "Run npm pack in the library repo and copy the tarball to vendor/ first."
  exit 1
fi

APP_PID=""
cleanup() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi

  if [ "${KEEP_STACK:-0}" = "1" ]; then
    echo "KEEP_STACK=1 set; docker compose stack left running"
  else
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker compose down -v --remove-orphans >/dev/null 2>&1 || true
docker compose up -d mysql mssql mssql-init

npm run wait:db
npm run ensure:archive-db
npm run build

APP_PORT="$APP_PORT" node dist/src/main.js > artifacts/app.log 2>&1 &
APP_PID="$!"

for i in {1..90}; do
  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
    echo "Application process exited before becoming ready"
    tail -n 200 artifacts/app.log || true
    exit 1
  fi

  if (echo > "/dev/tcp/127.0.0.1/$APP_PORT") >/dev/null 2>&1; then
    break
  fi

  sleep 1

  if [ "$i" = "90" ]; then
    echo "Application did not open port $APP_PORT"
    tail -n 200 artifacts/app.log || true
    exit 1
  fi
done

npm run smoke
npm run load -- --rate="$LOAD_RATE" --duration="$LOAD_DURATION"

echo "Waiting ${ARCHIVE_SETTLE_SECONDS}s for buffer flush and archive cron..."
sleep "$ARCHIVE_SETTLE_SECONDS"

npm run verify
