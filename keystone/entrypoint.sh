#!/bin/bash
set -e

echo "🔄 Syncing Prisma schema to database..."
pnpm prisma db push --skip-generate

echo "✅ Database schema synced"

echo "🏗️ Building admin UI..."
pnpm build

echo "🚀 Starting Keystone..."

exec pnpm start
