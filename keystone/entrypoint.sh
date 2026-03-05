#!/bin/sh
set -e

echo "🔨 Building Keystone..."
pnpm build

echo "🚀 Starting Keystone..."
exec pnpm start
