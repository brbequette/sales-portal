const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function auditDuplicates() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("======================================================")
  console.log("   DATABASE DUPLICATION AUDIT ACROSS ALL TABLES       ")
  console.log("======================================================\n")

  // 1. Audit Account Table (by name & zohoId)
  console.log("🔍 1. AUDITING 'Account' TABLE:")
  const accountZohoDupes = await client.query(`
    SELECT "zohoId", COUNT(*) as count 
    FROM "Account" 
    GROUP BY "zohoId" 
    HAVING COUNT(*) > 1;
  `)
  console.log(`   - Duplicate zohoIds: ${accountZohoDupes.rows.length}`)
  if (accountZohoDupes.rows.length > 0) console.log("     Sample zohoId dupes:", accountZohoDupes.rows)

  const accountNameDupes = await client.query(`
    SELECT LOWER(TRIM("name")) as clean_name, COUNT(*) as count, ARRAY_AGG("id") as ids, ARRAY_AGG("zohoId") as zoho_ids
    FROM "Account" 
    GROUP BY LOWER(TRIM("name")) 
    HAVING COUNT(*) > 1 
    ORDER BY count DESC
    LIMIT 20;
  `)
  console.log(`   - Account Name Duplicates (case-insensitive & trimmed): ${accountNameDupes.rows.length} groups found!`)
  accountNameDupes.rows.forEach((row, i) => {
    console.log(`     #${i+1} Name: "${row.clean_name}" | Count: ${row.count} | ZohoIDs: [${row.zoho_ids.join(', ')}]`)
  })

  // 2. Audit User Table
  console.log("\n🔍 2. AUDITING 'User' TABLE:")
  const userEmailDupes = await client.query(`
    SELECT LOWER(TRIM("email")) as clean_email, COUNT(*) as count 
    FROM "User" 
    GROUP BY LOWER(TRIM("email")) 
    HAVING COUNT(*) > 1;
  `)
  console.log(`   - Duplicate emails: ${userEmailDupes.rows.length}`)

  const userNameDupes = await client.query(`
    SELECT LOWER(TRIM("name")) as clean_name, COUNT(*) as count 
    FROM "User" 
    WHERE "name" IS NOT NULL AND "name" != ''
    GROUP BY LOWER(TRIM("name")) 
    HAVING COUNT(*) > 1;
  `)
  console.log(`   - Duplicate user names: ${userNameDupes.rows.length}`)

  // 3. Audit Invoice Table
  console.log("\n🔍 3. AUDITING 'Invoice' TABLE:")
  const invoiceZohoDupes = await client.query(`
    SELECT "zohoId", COUNT(*) as count 
    FROM "Invoice" 
    GROUP BY "zohoId" 
    HAVING COUNT(*) > 1;
  `)
  console.log(`   - Duplicate zohoIds: ${invoiceZohoDupes.rows.length}`)

  // 4. Audit Quote Table
  console.log("\n🔍 4. AUDITING 'Quote' TABLE:")
  const quoteZohoDupes = await client.query(`
    SELECT "zohoId", COUNT(*) as count 
    FROM "Quote" 
    GROUP BY "zohoId" 
    HAVING COUNT(*) > 1;
  `)
  console.log(`   - Duplicate zohoIds: ${quoteZohoDupes.rows.length}`)

  // 5. Audit Deal Table
  console.log("\n🔍 5. AUDITING 'Deal' TABLE:")
  const dealZohoDupes = await client.query(`
    SELECT "zohoId", COUNT(*) as count 
    FROM "Deal" 
    WHERE "zohoId" IS NOT NULL
    GROUP BY "zohoId" 
    HAVING COUNT(*) > 1;
  `)
  console.log(`   - Duplicate zohoIds: ${dealZohoDupes.rows.length}`)

  await client.end()
}

auditDuplicates().catch(console.error)
