#!/usr/bin/env bash
set -euo pipefail
umask 077
for name in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_ENDPOINT BACKUP_AGE_IDENTITY; do
  test -n "${!name:-}" || { echo "Missing restore configuration: $name" >&2; exit 1; }
done
test -z "${SUPABASE_DB_URL:-}${SUPABASE_SERVICE_ROLE_KEY:-}${SUPABASE_BACKUP_SECRET_KEY:-}" || { echo 'Production database credentials are forbidden in restore job'; exit 1; }
[[ "$R2_ENDPOINT" =~ ^https://[a-f0-9]{32}\.eu\.r2\.cloudflarestorage\.com/?$ && "$R2_BUCKET" == studenthub-backups ]] || exit 1
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || exit 1
work_dir="$(mktemp -d "$RUNNER_TEMP/studenthub-restore.XXXXXX")"
project="studenthub-restore-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
stack_dir="$work_dir/$project"
container="supabase_db_$project"
network="$project"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  case "$work_dir" in "$RUNNER_TEMP"/studenthub-restore.*) rm -rf -- "$work_dir";; esac
}
trap cleanup EXIT
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto AWS_EC2_METADATA_DISABLED=true
aws --endpoint-url "$R2_ENDPOINT" s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix studenthub/daily/ > "$work_dir/list.json"
key="$(node --input-type=module -e 'import{readFileSync}from"node:fs";const rows=JSON.parse(readFileSync(process.argv[1],"utf8")).Contents||[];const keys=rows.map(x=>x.Key).filter(x=>/^studenthub\/daily\/studenthub-daily-\d{8}T\d{6}Z\.tar\.gz\.age$/.test(x)).sort();if(!keys.length)throw Error("No complete backup object");console.log(keys.at(-1));' "$work_dir/list.json")"
aws --endpoint-url "$R2_ENDPOINT" s3 cp "s3://$R2_BUCKET/$key" "$work_dir/backup.age" --no-progress --only-show-errors
printf '%s\n' "$BACKUP_AGE_IDENTITY" > "$work_dir/identity"
age --decrypt --identity "$work_dir/identity" "$work_dir/backup.age" > "$work_dir/backup.tar.gz"
rm -f "$work_dir/identity"
# Accept only regular files/directories below the two backup roots.
tar -tzf "$work_dir/backup.tar.gz" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;for(const p of s.trim().split("\n"))if(p.startsWith("/")||p.split("/").includes("..")||!(/^(database|storage)(\/|$)|^manifest\.json$/.test(p)))throw Error("Unsafe archive path");'
tar -tvzf "$work_dir/backup.tar.gz" | awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {exit 1}'
mkdir "$work_dir/restored" "$stack_dir"
tar -xzf "$work_dir/backup.tar.gz" -C "$work_dir/restored" --no-same-owner --no-same-permissions
node scripts/backup/manifest.mjs verify "$work_dir/restored"
test -s "$work_dir/restored/database/managed.sql" && test -s "$work_dir/restored/database/history_data.sql" || { echo 'Legacy backup lacks complete security/migration metadata'; exit 1; }
echo "Restoring R2 snapshot: $key"
supabase init --workdir "$stack_dir" --yes > "$work_dir/init.log" 2>&1
docker network create --internal "$network" >/dev/null
supabase db start --workdir "$stack_dir" --network-id "$network" > "$work_dir/start.log" 2>&1 || { echo 'Isolated Supabase bootstrap failed before production data import'; exit 1; }
docker exec -i "$container" psql -U supabase_admin -d postgres -Xq -v ON_ERROR_STOP=1 > "$work_dir/setup.log" 2>&1 <<'SQL'
alter system set cron.launch_active_jobs = 'off';
alter system set log_statement = 'none';
alter system set log_min_error_statement = 'panic';
select pg_reload_conf();
drop schema if exists supabase_migrations cascade;
SQL
docker network disconnect "$network" "$container"
test "$(docker inspect --format '{{len .NetworkSettings.Networks}}' "$container")" == 0
restore="$work_dir/restored/database"
if ! cat "$restore/roles.sql" "$restore/schema.sql" "$restore/history_schema.sql" "$restore/managed.sql" "$restore/data.sql" "$restore/history_data.sql" | docker exec -i "$container" psql -U supabase_admin -d postgres -Xq --single-transaction -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate > "$work_dir/sql.log" 2>&1; then
  echo "Isolated SQL restore failed; SQLSTATE=$(grep -Eo 'ERROR:  [A-Z0-9]{5}' "$work_dir/sql.log" | head -1 | tr -cd 'A-Z0-9: ')"; exit 1
fi
node scripts/backup/restore-verify.mjs "$work_dir/restored" "$container" "$work_dir/storage-restored"
echo 'Actual isolated SQL restore, security metadata, row counts and Storage file recovery: PASS'
