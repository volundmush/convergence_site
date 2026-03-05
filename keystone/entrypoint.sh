#!/bin/bash
set -e

echo "🔄 Running Prisma migrations..."
pnpm prisma migrate deploy || pnpm prisma db push

echo "✅ Migrations complete"
echo "🚀 Starting Keystone..."

exec pnpm start
