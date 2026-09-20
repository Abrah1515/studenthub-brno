#!/usr/bin/env bash
set -euo pipefail

for name in SUPABASE_DB_URL SUPABASE_URL SUPABASE_BACKUP_SECRET_KEY BACKUP_AGE_RECIPIENT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_ENDPOINT; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing backup configuration: $name" >&2
    exit 1
  fi
done

if [[ ! "$R2_ENDPOINT" =~ ^https://[a-f0-9]{32}\.eu\.r2\.cloudflarestorage\.com/?$ ]]; then
  echo "R2_ENDPOINT must point to the private EU R2 S3 endpoint." >&2
  exit 1
fi
if [[ ! "$BACKUP_AGE_RECIPIENT" =~ ^age1[a-z0-9]+$ ]]; then
  echo "BACKUP_AGE_RECIPIENT must be an age public recipient." >&2
  exit 1
fi
if [[ "$R2_BUCKET" != "studenthub-backups" ]]; then
  echo "Unexpected R2 backup bucket." >&2
  exit 1
fi
node scripts/backup/check-config.mjs

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
export AWS_EC2_METADATA_DISABLED=true

work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
mkdir -p "$work_dir/database" "$work_dir/storage"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work_dir/database/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work_dir/database/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work_dir/database/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
node scripts/backup/export-storage.mjs "$work_dir/storage"
node scripts/backup/manifest.mjs create "$work_dir"
node scripts/backup/manifest.mjs verify "$work_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$work_dir/studenthub-daily-$timestamp.tar.gz.age"
tar -C "$work_dir" -cf - database storage manifest.json | gzip -1 | age -r "$BACKUP_AGE_RECIPIENT" -o "$archive"
test -s "$archive"

daily_key="studenthub/daily/$(basename "$archive")"
aws --endpoint-url "$R2_ENDPOINT" s3 cp "$archive" "s3://$R2_BUCKET/$daily_key" --no-progress --only-show-errors
aws --endpoint-url "$R2_ENDPOINT" s3 cp "s3://$R2_BUCKET/$daily_key" "$work_dir/roundtrip.age" --no-progress --only-show-errors
cmp --silent "$archive" "$work_dir/roundtrip.age"

if [[ "$(date -u +%u)" == "7" ]]; then
  weekly_key="studenthub/weekly/studenthub-weekly-$timestamp.tar.gz.age"
  aws --endpoint-url "$R2_ENDPOINT" s3 cp "$archive" "s3://$R2_BUCKET/$weekly_key" --no-progress --only-show-errors
fi

node scripts/backup/prune-r2.mjs
echo "Encrypted StudentHub backup uploaded and verified in R2."
