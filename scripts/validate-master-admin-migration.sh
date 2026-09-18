#!/usr/bin/env bash
set -euo pipefail

compose_dir="/mnt/c/Users/titan/Documents/ChatGPT/Titan Diamond"
source_prisma="/mnt/c/Users/titan/Documents/ChatGPT/worktrees/production-main-current/prisma"
validation_dir="/tmp/tdgpt-master-auth-validation"
validation_db="tdgpt_master_auth_validation"

cd "$compose_dir"
app_id=$(docker compose -f compose.dev.yaml --env-file .env.dev ps -q app)
pg_id=$(docker compose -f compose.dev.yaml --env-file .env.dev ps -q postgres)
test -n "$app_id"
test -n "$pg_id"

cleanup() {
  docker exec "$pg_id" dropdb --if-exists -U tdgpt_dev "$validation_db" >/dev/null 2>&1 || true
  test "$validation_dir" = "/tmp/tdgpt-master-auth-validation"
  docker exec "$app_id" rm -rf -- "$validation_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker exec "$pg_id" createdb -U tdgpt_dev "$validation_db"
docker exec "$app_id" mkdir -p "$validation_dir"
docker cp "$source_prisma" "$app_id:$validation_dir/prisma" >/dev/null
docker exec -e DATABASE_URL="postgresql://tdgpt_dev:tdgpt-dev-local-only@postgres:5432/$validation_db" \
  "$app_id" /app/node_modules/.bin/prisma migrate deploy --schema "$validation_dir/prisma/schema.prisma"

table_count=$(docker exec "$pg_id" psql -U tdgpt_dev -d "$validation_db" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('LocalMasterCredential','MasterAdminLoginThrottle');")
unique_count=$(docker exec "$pg_id" psql -U tdgpt_dev -d "$validation_db" -Atc \
  "SELECT count(*) FROM pg_indexes WHERE indexname IN ('LocalMasterCredential_userId_key','LocalMasterCredential_loginIdentifier_key');")
fk_count=$(docker exec "$pg_id" psql -U tdgpt_dev -d "$validation_db" -Atc \
  "SELECT count(*) FROM information_schema.table_constraints WHERE table_name='LocalMasterCredential' AND constraint_type='FOREIGN KEY';")
test "$table_count" = "2"
test "$unique_count" = "2"
test "$fk_count" = "1"
echo "DISPOSABLE_MASTER_AUTH_MIGRATION=PASS tables=$table_count unique_constraints=$unique_count foreign_keys=$fk_count"
