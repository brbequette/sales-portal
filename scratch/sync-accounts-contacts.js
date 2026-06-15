const fs = require("fs")
const { parse } = require("csv-parse/sync")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  console.log("Starting Accounts and Contacts sync...")
  
  const users = await prisma.user.findMany()
  const userMap = new Map()
  users.forEach(u => { if (u.name) userMap.set(u.name.toLowerCase().trim(), u.id) })

  const getOwnerId = (name) => {
    if (!name) return null;
    let oid = userMap.get(name.toLowerCase().trim());
    if (oid) return oid;
    if (name.toLowerCase().includes("bobby")) return userMap.get("bobby salyers");
    if (name.toLowerCase().includes("ben")) return userMap.get("benjamin bequette");
    if (name.toLowerCase().includes("ross")) return userMap.get("ross haisler");
    if (name.toLowerCase().includes("monty") || name.toLowerCase().includes("montgomery")) return userMap.get("montgomery morgan");
    if (name.toLowerCase().includes("richard")) return userMap.get("richard griffin");
    return null;
  }

  // 1. Sync Accounts
  console.log("Parsing Accounts...")
  const accPath = "C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/Accounts_2026_06_12.csv"
  const accCsv = fs.readFileSync(accPath, "utf8")
  const accRecords = parse(accCsv, { columns: true, skip_empty_lines: true, relax_quotes: true })

  console.log(`Found ${accRecords.length} accounts. Syncing...`)
  
  let accUpserts = 0
  for (const row of accRecords) {
    const zohoId = row["Record Id"]
    const name = row["Account Name"]
    const ownerName = row["Account Owner"]
    if (!zohoId || !name) continue

    let ownerId = getOwnerId(ownerName)
    if (!ownerId) {
      // fallback to admin
      const admin = users.find(u => u.email === "ben@titandiamond.net")
      ownerId = admin ? admin.id : users[0].id
    }

    await prisma.account.upsert({
      where: { zohoId: zohoId },
      update: { name: name, ownerId: ownerId },
      create: { zohoId: zohoId, name: name, ownerId: ownerId, status: "Update Status" }
    })
    accUpserts++
  }
  console.log(`Finished upserting ${accUpserts} accounts.`)

  // 2. Sync Contacts
  console.log("Parsing Contacts...")
  const cntPath = "C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/Contacts_2026_06_12.csv"
  const cntCsv = fs.readFileSync(cntPath, "utf8")
  const cntRecords = parse(cntCsv, { columns: true, skip_empty_lines: true, relax_quotes: true })

  console.log(`Found ${cntRecords.length} contacts. Syncing...`)

  let cntUpserts = 0
  let unlinkedContacts = 0
  for (const row of cntRecords) {
    const zohoId = row["Record Id"]
    const accountZohoId = row["Account Name.id"]
    const firstName = row["First Name"] || null
    const lastName = row["Last Name"] || null
    const email = row["Email"] || null
    const phone = row["Phone"] || null
    const mobilePhone = row["Mobile"] || null

    if (!zohoId || !accountZohoId) continue

    const dbAccount = await prisma.account.findUnique({ where: { zohoId: accountZohoId } })
    if (!dbAccount) {
        unlinkedContacts++
        continue
    }

    await prisma.contact.upsert({
      where: { zohoId: zohoId },
      update: {
        accountId: dbAccount.id,
        firstName,
        lastName,
        email,
        phone,
        mobilePhone
      },
      create: {
        zohoId: zohoId,
        accountId: dbAccount.id,
        firstName,
        lastName,
        email,
        phone,
        mobilePhone
      }
    })
    cntUpserts++
  }

  console.log(`Finished upserting ${cntUpserts} contacts. (Skipped ${unlinkedContacts} with missing accounts).`)
  console.log("Sync Complete!")
}

main().catch(console.error).finally(() => prisma.$disconnect())
