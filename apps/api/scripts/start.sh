#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[api] DATABASE_URL is not set; cannot run prisma migrate deploy" >&2
  exit 1
fi

PRISMA_BIN=""
for candidate in \
  /app/node_modules/.bin/prisma \
  /app/packages/database/node_modules/.bin/prisma
do
  if [ -e "$candidate" ]; then
    PRISMA_BIN="$candidate"
    break
  fi
done

if [ -z "$PRISMA_BIN" ]; then
  echo "[api] prisma CLI not found in the image" >&2
  exit 1
fi

echo "[api] running prisma migrate deploy"
(cd /app/packages/database && "$PRISMA_BIN" migrate deploy)
echo "[api] migrations applied"

exec node /app/apps/api/dist/main.js
