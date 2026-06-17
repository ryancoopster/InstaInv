#!/bin/sh
set -e

echo "→ Applying database migrations..."
npx prisma migrate deploy || npx prisma db push

echo "→ Seeding database (idempotent)..."
npx tsx prisma/seed.ts || echo "Seed skipped/failed (continuing)."

echo "→ Starting InstaInv..."
exec "$@"
