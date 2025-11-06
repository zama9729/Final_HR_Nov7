#!/bin/bash

# Backup Script: Pre-migration backup for Payroll database
# 
# Creates a timestamped backup of the Payroll database before running migrations
#
# Usage:
#   ./scripts/backup.sh
#
# Environment Variables:
#   PAYROLL_DB_URL - Payroll PostgreSQL connection string
#   BACKUP_DIR - Directory to store backups (default: ./backups)

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/payroll_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Extract connection details from PAYROLL_DB_URL
if [ -z "$PAYROLL_DB_URL" ]; then
  echo "Error: PAYROLL_DB_URL environment variable is not set"
  exit 1
fi

echo "Creating backup: $BACKUP_FILE"

# Create backup using pg_dump
pg_dump "$PAYROLL_DB_URL" > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

echo "✅ Backup created: $BACKUP_FILE"
echo "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep only last 10 backups
ls -t "${BACKUP_DIR}"/payroll_backup_*.sql.gz | tail -n +11 | xargs -r rm

echo "✅ Backup complete"


