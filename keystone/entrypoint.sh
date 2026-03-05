#!/bin/sh
set -e

echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
  echo "📥 node_modules not found, installing dependencies..."
  pnpm install
else
  echo "✓ Dependencies found"
fi

echo "🔨 Building Keystone..."
pnpm build

echo "🚀 Starting Keystone..."
pnpm start
