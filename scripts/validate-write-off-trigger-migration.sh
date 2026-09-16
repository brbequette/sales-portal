#!/usr/bin/env bash
set -euo pipefail

compose_dir="/mnt/c/Users/titan/Documents/ChatGPT/Titan Diamond"
source_prisma="/mnt/c/Users/titan/Documents/ChatGPT/worktrees/production-main-current/prisma"
validation_dir="/tmp/tdgpt-trigger-validation"
validation_db="tdgpt_trigger_validation"

cd "$compose_dir"
app_id=$(docker compose -f compose.dev.yaml --env-file .env.dev ps -q app)
pg_id=$(docker compose -f compose.dev.yaml --env-file .env.dev ps -q postgres)
test -n "$app_id"
test -n "$pg_id"

cleanup() {
  docker exec "$pg_id" dropdb --if-exists -U tdgpt_dev "$validation_db" >/dev/null 2>&1 || true
  test "$validation_dir" = "/tmp/tdgpt-trigger-validation"
  docker exec "$app_id" rm -rf -- "$validation_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker exec "$pg_id" createdb -U tdgpt_dev "$validation_db"
docker exec "$app_id" mkdir -p "$validation_dir"
docker cp "$source_prisma" "$app_id:$validation_dir/prisma" >/dev/null
docker exec \
  -e DATABASE_URL="postgresql://tdgpt_dev:tdgpt-dev-local-only@postgres:5432/$validation_db" \
  "$app_id" /app/node_modules/.bin/prisma migrate deploy --schema "$validation_dir/prisma/schema.prisma"

index_count=$(docker exec "$pg_id" psql -U tdgpt_dev -d "$validation_db" -Atc \
  "SELECT count(*) FROM pg_indexes WHERE indexname IN ('WriteOffRecoveryCase_triggerSourceField_triggerZohoInvoiceId_key','WriteOffRecoveryTriggerRecord_idempotencyKey_key');")
trigger_count=$(docker exec "$pg_id" psql -U tdgpt_dev -d "$validation_db" -Atc \
  "SELECT count(*) FROM pg_trigger WHERE tgname='WriteOffRecoveryTriggerRecord_immutable' AND NOT tgisinternal;")
test "$index_count" = "2"
test "$trigger_count" = "1"
echo "DISPOSABLE_TRIGGER_MIGRATION=PASS indexes=$index_count immutable_triggers=$trigger_count"
