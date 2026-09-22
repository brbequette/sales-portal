param([Parameter(Mandatory=$true)][string]$ConnectionString)
$ErrorActionPreference = 'Stop'
$target = '20260922230000_durable_campaign_recovery'
& psql 'postgresql://campaign_ci:campaign_ci_password@localhost:5432/postgres' -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS campaign_upgrade' -c 'CREATE DATABASE campaign_upgrade'
if ($LASTEXITCODE -ne 0) { throw 'Unable to create disposable upgrade database' }
Get-ChildItem -LiteralPath 'prisma/migrations' -Directory | Sort-Object Name | Where-Object Name -LT $target | ForEach-Object {
  & psql $ConnectionString -v ON_ERROR_STOP=1 -f (Join-Path $_.FullName 'migration.sql')
  if ($LASTEXITCODE -ne 0) { throw "Preceding migration failed: $($_.Name)" }
}
$fixture = @'
INSERT INTO "User" ("id","email","name","updatedAt") VALUES ('campaign-ci-user','campaign-ci@example.invalid','Campaign CI',NOW());
INSERT INTO "Account" ("id","zohoId","name","ownerId","updatedAt") VALUES ('campaign-ci-account','campaign-ci-account','Campaign CI Account','campaign-ci-user',NOW());
INSERT INTO "CampaignBlast" ("id","name","content","channel","authorId") VALUES
 ('blast-complete','complete','','SMS','campaign-ci-user'),('blast-unfinished','unfinished','','SMS','campaign-ci-user'),('blast-inconsistent','inconsistent','','SMS','campaign-ci-user'),('blast-known','known','','SMS','campaign-ci-user');
INSERT INTO "CampaignJob" ("id","authorId","blastId","status","campaignName","accountIds","currentIndex","total","updatedAt") VALUES
 ('legacy-complete','campaign-ci-user','blast-complete','DONE','complete','[]',1,1,NOW()),
 ('legacy-unfinished','campaign-ci-user','blast-unfinished','RUNNING','unfinished','[]',0,10,NOW()),
 ('legacy-inconsistent','campaign-ci-user','blast-inconsistent','RUNNING','inconsistent','[]',201,2073,NOW()),
 ('cmud3ggj9000311xvyygo6aje','campaign-ci-user','blast-known','ERROR','known','[]',201,2073,NOW());
INSERT INTO "CampaignLog" ("id","campaignBlastId","accountId","status") SELECT 'inc-'||g,'blast-inconsistent','campaign-ci-account',CASE WHEN g<=205 THEN 'SUCCESS' ELSE 'FAILED' END FROM generate_series(1,212) g;
INSERT INTO "CampaignLog" ("id","campaignBlastId","accountId","status") SELECT 'known-'||g,'blast-known','campaign-ci-account',CASE WHEN g<=205 THEN 'SUCCESS' ELSE 'FAILED' END FROM generate_series(1,212) g;
'@
$fixture | & psql $ConnectionString -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Unable to create legacy fixtures' }
& psql $ConnectionString -v ON_ERROR_STOP=1 -f "prisma/migrations/$target/migration.sql"
if ($LASTEXITCODE -ne 0) { throw 'Durable campaign migration failed' }
$assertions = @'
DO $$ BEGIN
 IF (SELECT "status" FROM "CampaignJob" WHERE "id"='legacy-complete') <> 'COMPLETED' THEN RAISE EXCEPTION 'completed classification failed'; END IF;
 IF (SELECT "status" FROM "CampaignJob" WHERE "id"='legacy-unfinished') <> 'LEGACY_QUARANTINED' THEN RAISE EXCEPTION 'unfinished job was made resumable'; END IF;
 IF (SELECT "status" FROM "CampaignJob" WHERE "id"='legacy-inconsistent') <> 'LEGACY_QUARANTINED' THEN RAISE EXCEPTION 'inconsistent quarantine failed'; END IF;
 IF (SELECT "status" FROM "CampaignJob" WHERE "id"='cmud3ggj9000311xvyygo6aje') <> 'LEGACY_QUARANTINED' THEN RAISE EXCEPTION 'known job quarantine failed'; END IF;
 IF (SELECT "legacyRawMissingCount" FROM "CampaignJob" WHERE "id"='cmud3ggj9000311xvyygo6aje') <> 1861 THEN RAISE EXCEPTION 'known raw missing count changed'; END IF;
 IF EXISTS (SELECT 1 FROM "CampaignRecipient" WHERE "campaignJobId" IN ('legacy-unfinished','legacy-inconsistent','cmud3ggj9000311xvyygo6aje')) THEN RAISE EXCEPTION 'legacy recipients became sendable'; END IF;
 IF (SELECT count(*) FROM "CampaignLog" WHERE "campaignBlastId" IN ('blast-inconsistent','blast-known')) <> 424 THEN RAISE EXCEPTION 'historical results lost'; END IF;
END $$;
'@
$assertions | & psql $ConnectionString -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Legacy upgrade assertions failed' }
Write-Output 'LEGACY_UPGRADE_PATH=PASS'
