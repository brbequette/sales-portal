param([Parameter(Mandatory=$true)][string]$ConnectionString)
$ErrorActionPreference = 'Stop'
$target = '20260925010000_sales_lifecycle_provider_persistence'
$admin = 'postgresql://lifecycle_ci:lifecycle_ci_password@localhost:5432/postgres'

& psql $admin -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS lifecycle_upgrade' -c 'CREATE DATABASE lifecycle_upgrade'
if ($LASTEXITCODE -ne 0) { throw 'Unable to create disposable lifecycle upgrade database' }

Get-ChildItem -LiteralPath 'prisma/migrations' -Directory | Sort-Object Name | Where-Object Name -LT $target | ForEach-Object {
  & psql $ConnectionString -v ON_ERROR_STOP=1 -f (Join-Path $_.FullName 'migration.sql')
  if ($LASTEXITCODE -ne 0) { throw "Preceding migration failed: $($_.Name)" }
}

$fixtures = @'
INSERT INTO "User" ("id","email","name","updatedAt") VALUES ('lifecycle-user','lifecycle@example.invalid','Lifecycle CI',NOW());
INSERT INTO "Account" ("id","zohoId","name","ownerId","updatedAt") VALUES ('lifecycle-account','acc_from_lead_local_fixture','Lifecycle Fixture','lifecycle-user',NOW());
INSERT INTO "Contact" ("id","zohoId","accountId","firstName","lastName","updatedAt") VALUES ('lifecycle-contact','cnt_lifecycle-account','lifecycle-account','Fixture','Contact',NOW());
INSERT INTO "Lead" ("id","zohoId","company","ownerId","updatedAt","convertedAccountId") VALUES ('lifecycle-lead','lead_local_fixture','Lifecycle Fixture','lifecycle-user',NOW(),'lifecycle-account');
INSERT INTO "Product" ("id","sku","name","price","updatedAt") VALUES ('lifecycle-product','LIFECYCLE-SKU','Lifecycle Product',1.25,NOW());
'@
$fixtures | & psql $ConnectionString -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Unable to create lifecycle upgrade fixtures' }

& psql $ConnectionString -v ON_ERROR_STOP=1 -f "prisma/migrations/$target/migration.sql"
if ($LASTEXITCODE -ne 0) { throw 'Lifecycle provider persistence migration failed' }

$assertions = @'
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Account" WHERE "id"='lifecycle-account' AND "ownerId"='lifecycle-user') THEN RAISE EXCEPTION 'account relationship lost'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Contact" WHERE "id"='lifecycle-contact' AND "accountId"='lifecycle-account') THEN RAISE EXCEPTION 'contact relationship lost'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Lead" WHERE "id"='lifecycle-lead' AND "convertedAccountId"='lifecycle-account') THEN RAISE EXCEPTION 'lead relationship lost'; END IF;
 IF EXISTS (SELECT 1 FROM "Account" WHERE "id"='lifecycle-account' AND ("crmAccountId" IS NOT NULL OR "booksCustomerId" IS NOT NULL)) THEN RAISE EXCEPTION 'legacy account placeholder was inferred as provider identity'; END IF;
 IF EXISTS (SELECT 1 FROM "Contact" WHERE "id"='lifecycle-contact' AND ("crmContactId" IS NOT NULL OR "booksContactId" IS NOT NULL)) THEN RAISE EXCEPTION 'legacy contact placeholder was inferred as provider identity'; END IF;
 IF EXISTS (SELECT 1 FROM "Lead" WHERE "id"='lifecycle-lead' AND "crmLeadId" IS NOT NULL) THEN RAISE EXCEPTION 'legacy lead placeholder was inferred as provider identity'; END IF;
 IF (SELECT "providerSyncState"::text FROM "Lead" WHERE "id"='lifecycle-lead') <> 'PENDING' THEN RAISE EXCEPTION 'legacy lead state is not pending reconciliation'; END IF;
 IF (SELECT count(*) FROM "ProviderWriteOperation") <> 0 THEN RAISE EXCEPTION 'migration invented provider operations'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Product" WHERE "id"='lifecycle-product' AND "sku"='LIFECYCLE-SKU' AND "booksItemId" IS NULL AND "unitCost" IS NULL AND "costQuality"='UNKNOWN' AND "canDropship" IS NULL) THEN RAISE EXCEPTION 'product upgrade was not additive'; END IF;
END $$;
'@
$assertions | & psql $ConnectionString -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Lifecycle upgrade assertions failed' }
Write-Output 'SALES_LIFECYCLE_UPGRADE=PASS'
