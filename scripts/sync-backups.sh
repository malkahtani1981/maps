#!/usr/bin/env bash
# Sync nightly database backups to any S3-compatible object store.
# Expected environment variables (set in /opt/maps/scripts/.env):
#   S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION (optional)
#
# Usage:
#   /opt/maps/scripts/sync-backups.sh [destination-prefix]
#   Example: /opt/maps/scripts/sync-backups.sh s3://my-bucket/maps-backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  set -a
  . "$ENV_FILE"
  set +a
fi

DEST_PREFIX="${1:-${S3_BUCKET:-}}"
if [ -z "$DEST_PREFIX" ]; then
  echo "Usage: $0 s3://bucket/path or set S3_BUCKET in ${ENV_FILE}" >&2
  exit 1
fi

BACKUP_DIR="/opt/maps/backups"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "Backup directory ${BACKUP_DIR} does not exist." >&2
  exit 1
fi

# Verify required credentials
if [ -z "${S3_ENDPOINT:-}" ] || [ -z "${S3_ACCESS_KEY:-}" ] || [ -z "${S3_SECRET_KEY:-}" ]; then
  echo "Missing S3_ENDPOINT, S3_ACCESS_KEY, or S3_SECRET_KEY in ${ENV_FILE}" >&2
  exit 1
fi

# Use rclone if available; otherwise fall back to s3cmd if available; otherwise warn.
if command -v rclone >/dev/null 2>&1; then
  : "${S3_REGION:=us-east-1}"
  REMOTE_NAME="mapsbackup"
  rclone config create "$REMOTE_NAME" s3 \
    provider Other \
    env_auth false \
    access_key_id "$S3_ACCESS_KEY" \
    secret_access_key "$S3_SECRET_KEY" \
    endpoint "$S3_ENDPOINT" \
    region "$S3_REGION" >/dev/null 2>&1 || true
  rclone sync "$BACKUP_DIR" "${REMOTE_NAME}:${DEST_PREFIX#s3://}" --include '*.sql.gz' --s3-no-check-bucket
elif command -v s3cmd >/dev/null 2>&1; then
  s3cmd sync --recursive "$BACKUP_DIR/" "$DEST_PREFIX/" \
    --host="$S3_ENDPOINT" \
    --host-bucket="" \
    --access_key="$S3_ACCESS_KEY" \
    --secret_key="$S3_SECRET_KEY"
else
  echo "No S3 sync tool found. Install rclone or s3cmd to use this script." >&2
  echo "  rclone: https://rclone.org/install/" >&2
  echo "  s3cmd:  pip install s3cmd" >&2
  exit 1
fi

echo "Backups synced to ${DEST_PREFIX}"
