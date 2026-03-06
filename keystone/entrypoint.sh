#!/bin/bash
set -e

echo "🔄 Syncing Prisma schema to database..."
pnpm prisma db push --skip-generate

echo "✅ Database schema synced"
echo "🌱 Running seed script..."
pnpm run seed

echo "✅ Seed completed"
echo "🚀 Starting Keystone..."

exec pnpm start
