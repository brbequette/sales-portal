const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function syncSalesReps() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== CHECKING ALL USERS IN DATABASE ===")
  const allUsersRes = await client.query(`SELECT "id", "name", "email", "role" FROM "User";`)
  console.log(`Total users in DB: ${allUsersRes.rows.length}`)
  allUsersRes.rows.forEach(u => console.log(`  - Name: "${u.name}" | Email: "${u.email}" | Role: "${u.role}" | ID: ${u.id}`))

  const salesRepsToEnsure = [
    { name: "MONTGOMERY MORGAN", email: "montgomery@tdusales.com", role: "AGENT" },
    { name: "ROSS HAISLER", email: "ross@tdusales.com", role: "AGENT" },
    { name: "BOBBY SALYERS", email: "bobby@tdusales.com", role: "AGENT" },
    { name: "BEN BEQUETTE", email: "ben@tdusales.com", role: "ADMIN" },
    { name: "RICHARD GRIFFIN", email: "richard@tdusales.com", role: "AGENT" },
    { name: "TONY DELJOOI", email: "tony@tdusales.com", role: "AGENT" },
    { name: "JEFF BLACK", email: "jeff@tdusales.com", role: "AGENT" },
    { name: "PAUL GENCUSKI", email: "paul@tdusales.com", role: "AGENT" },
    { name: "TRACY GURSCHKE", email: "tracy@tdusales.com", role: "AGENT" },
    { name: "JUSTIN ZASTROW", email: "justin@tdusales.com", role: "AGENT" }
  ]

  console.log("\nEnsuring all Sales Reps exist in User table...")
  for (const rep of salesRepsToEnsure) {
    const existing = allUsersRes.rows.find(u => u.name?.toLowerCase().trim() === rep.name.toLowerCase().trim() || u.email?.toLowerCase().trim() === rep.email.toLowerCase().trim())
    if (!existing) {
      console.log(`  ➕ Inserting missing sales rep: ${rep.name}`)
      await client.query(`
        INSERT INTO "User" ("id", "name", "email", "role", "showOnSalesBoard", "constantVigEnabled", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, true, false, NOW(), NOW());
      `, [rep.name, rep.email, rep.role])
    } else {
      console.log(`  ✅ Existing sales rep: ${rep.name} (id: ${existing.id})`)
      await client.query(`
        UPDATE "User" SET "showOnSalesBoard" = true WHERE "id" = $1;
      `, [existing.id])
    }
  }

  const finalUsersRes = await client.query(`SELECT "id", "name", "email", "role" FROM "User";`)
  console.log(`\nFinal Users count in DB: ${finalUsersRes.rows.length}`)
  finalUsersRes.rows.forEach(u => console.log(`  - Name: "${u.name}" | Email: "${u.email}" | Role: "${u.role}" | ID: ${u.id}`))

  await client.end()
}

syncSalesReps().catch(console.error)
