#!/bin/bash
set -euo pipefail

BACKUP_DIR="/mnt/data/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=14

# Database containers and their credentials
declare -A DATABASES=(
  ["postgres-dns-vpn"]="dns2vpn:dns2vpn"
  ["postgres-devices"]="devices:devices"
)

echo "[$(date)] Starting PostgreSQL backups..."

for container in "${!DATABASES[@]}"; do
  IFS=':' read -r db user <<< "${DATABASES[$container]}"
  backup_file="${BACKUP_DIR}/${db}_${TIMESTAMP}.sql.gz"

  echo "  Backing up ${db} from ${container}..."
  if docker exec "$container" pg_dump -U "$user" "$db" | gzip > "$backup_file"; then
    size=$(du -h "$backup_file" | cut -f1)
    echo "  OK: ${backup_file} (${size})"
  else
    echo "  FAILED: ${db}" >&2
    rm -f "$backup_file"
  fi
done

# Clean up old backups
echo "  Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup complete."
