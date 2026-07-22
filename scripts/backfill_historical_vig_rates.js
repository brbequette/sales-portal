const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function backfillHistoricalVig() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== BACKFILLING HISTORICAL VIG RULES & USER OVERRIDES ===")

  // 1. Set Montgomery Morgan to constantVigValue = 1.0, constantVigEnabled = true
  const montyRes = await client.query(`
    UPDATE "User"
    SET "constantVigEnabled" = true, "constantVigValue" = 1.0
    WHERE LOWER("name") LIKE '%montgomery%' OR LOWER("name") LIKE '%morgan%' OR LOWER("email") LIKE '%monty%';
  `)
  console.log(`✅ Updated Montgomery Morgan: ${montyRes.rowCount} record(s) set to 1.0x constant VIG override.`)

  // 2. Ensure all other reps start with constantVigValue = 1.3 or default
  const othersRes = await client.query(`
    UPDATE "User"
    SET "constantVigValue" = 1.3
    WHERE "constantVigValue" IS NULL AND NOT (LOWER("name") LIKE '%montgomery%' OR LOWER("name") LIKE '%morgan%');
  `)
  console.log(`✅ Initialized ${othersRes.rowCount} other users to 1.3x baseline VIG.`)

  // 3. Ensure SystemSetting default_vig_rate is 1.3
  await client.query(`
    INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
    VALUES ('default_vig_rate', '1.3', NOW())
    ON CONFLICT ("key") DO UPDATE SET "value" = '1.3', "updatedAt" = NOW();
  `)
  console.log(`✅ Configured default_vig_rate system setting to 1.3x.`)

  await client.end()
}

backfillHistoricalVig().catch(console.error)
