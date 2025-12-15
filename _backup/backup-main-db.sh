#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_NAME="homelab-db-$(date +%Y%m%d_%H%M%S).sql.gz"
LOCAL_BACKUP_DIR="/var/backups/homelab"
RETENTION_DAYS=14

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

# Ensure local backup dir exists
mkdir -p "$LOCAL_BACKUP_DIR"

# Dump and compress
docker exec postgres-main pg_dump -U dns2vpn dns2vpn | gzip > "$LOCAL_BACKUP_DIR/$BACKUP_NAME"

# Upload to Google Drive
rclone --config "$SCRIPT_DIR/rclone.conf" copy "$LOCAL_BACKUP_DIR/$BACKUP_NAME" gdrive:homelab-backups/

# Delete local backups older than retention period
find "$LOCAL_BACKUP_DIR" -name "homelab-db-*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Signal success to healthchecks.io
if [ -n "$HC_PING_URL" ]; then
  curl -fsS -m 10 --retry 5 "$HC_PING_URL"
fi
