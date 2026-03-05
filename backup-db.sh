#!/bin/bash
set -euo pipefail

# PostgreSQL Database Backup Script
# Creates timestamped backups in the ./backups directory

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/convergence_web_$TIMESTAMP.sql"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting PostgreSQL backup..."
echo "Backup file: $BACKUP_FILE"

# Get postgres credentials from .env or use defaults
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-convergence_web}"

# Run pg_dump in the postgres container
docker-compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"

echo "Backup completed successfully!"
echo "Backup file size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Clean up backups older than 30 days
echo "Cleaning up backups older than 30 days..."
find "$BACKUP_DIR" -name "*.sql" -type f -mtime +30 -delete

echo "Done!"
