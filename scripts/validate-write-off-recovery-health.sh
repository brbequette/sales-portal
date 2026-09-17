#!/usr/bin/env bash
set -euo pipefail

compose_dir="/mnt/c/Users/titan/Documents/ChatGPT/Titan Diamond"
source_root="/mnt/c/Users/titan/Documents/ChatGPT/worktrees/production-main-current"
validation_dir="/tmp/tdgpt-recovery-health-validation"
validation_db="tdgpt_recovery_health_validation"

cd "$compose_dir"
app_id=$(docker compose -f compose.dev.yaml --env-file .env.dev ps -q app)
pg_id=$(docker compose -f compose.dev.yaml --env-file .env.dev ps -q postgres)
test -n "$app_id"
test -n "$pg_id"

cleanup() {
  docker exec "$pg_id" dropdb --if-exists -U tdgpt_dev "$validation_db" >/dev/null 2>&1 || true
  test "$validation_dir" = "/tmp/tdgpt-recovery-health-validation"
  docker exec "$app_id" rm -rf -- "$validation_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker exec "$pg_id" createdb -U tdgpt_dev "$validation_db"
docker exec "$app_id" mkdir -p "$validation_dir"
docker cp "$source_root/prisma" "$app_id:$validation_dir/prisma" >/dev/null
docker cp "$source_root/src/lib/write-off-recovery-health.ts" "$app_id:$validation_dir/write-off-recovery-health.ts" >/dev/null
database_url="postgresql://tdgpt_dev:tdgpt-dev-local-only@postgres:5432/$validation_db"
docker exec -e DATABASE_URL="$database_url" "$app_id" \
  /app/node_modules/.bin/prisma migrate deploy --schema "$validation_dir/prisma/schema.prisma" >/dev/null
docker exec "$app_id" /app/node_modules/.bin/esbuild \
  "$validation_dir/write-off-recovery-health.ts" --bundle --platform=node --format=cjs \
  --external:@prisma/client --outfile="$validation_dir/health.cjs" >/dev/null

result=$(docker exec -e DATABASE_URL="$database_url" -e NODE_PATH="/app/node_modules" -e HEALTH_MODULE="$validation_dir/health.cjs" "$app_id" node -e '
const { PrismaClient } = require("@prisma/client");
const { readWriteOffRecoveryHealth } = require(process.env.HEALTH_MODULE);
const db = new PrismaClient();
readWriteOffRecoveryHealth(db).then(health => {
  const expected = health.assertions.schemaReady === true &&
    health.assertions.syntheticTestReady === true &&
    Object.values(health.schema).every(Boolean) &&
    Object.values(health.counts).every(value => value === 0);
  if (!expected) throw new Error(JSON.stringify(health));
  console.log("WRITE_OFF_RECOVERY_HEALTH_DB=PASS schemaReady=true counts=0");
}).finally(() => db.$disconnect());')

echo "$result"
