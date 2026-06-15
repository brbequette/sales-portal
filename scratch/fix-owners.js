const fs = require("fs")
const { parse } = require("csv-parse/sync")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  console.log("Starting owner fix...")
  
  const users = await prisma.user.findMany()
  const userMap = new Map()
  users.forEach(u => { if (u.name) userMap.set(u.name.toLowerCase().trim(), u.id) })

  const getOwnerId = (name) => {
    if (!name) return null;
    let oid = userMap.get(name.toLowerCase().trim());
    if (oid) return oid;
    // fallbacks for known aliases
    if (name.toLowerCase().includes("bobby")) return userMap.get("bobby salyers");
    if (name.toLowerCase().includes("ben")) return userMap.get("benjamin bequette");
    if (name.toLowerCase().includes("ross")) return userMap.get("ross haisler");
    if (name.toLowerCase().includes("monty") || name.toLowerCase().includes("montgomery")) return userMap.get("montgomery morgan");
    if (name.toLowerCase().includes("richard")) return userMap.get("richard griffin");
    return null;
  }

  // 1. All accounts need to be assigned to the CRM owner (Deal Owner from Deals_2026_06_12.csv)
  console.log("Fixing Account Owners from Deals CSV...")
  const dealsCsv = fs.readFileSync("C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/Deals_2026_06_12.csv", "utf8")
  const dealsRecords = parse(dealsCsv, { columns: true, skip_empty_lines: true, relax_quotes: true })
  
  let accUpdates = 0
  for (const row of dealsRecords) {
    const accountName = row["Account Name"]
    const dealOwner = row["Deal Owner"]
    if (!accountName || !dealOwner) continue

    const ownerId = getOwnerId(dealOwner)
    if (ownerId) {
       // Find account
       const acc = await prisma.account.findFirst({ where: { name: accountName } })
       if (acc && acc.ownerId !== ownerId) {
          await prisma.account.update({ where: { id: acc.id }, data: { ownerId } })
          accUpdates++
       }
    }
  }
  console.log(`Updated ${accUpdates} accounts to their CRM Deal Owner.`)

  // 2. All docs (Deals) go off the sales rep not the owner (Sales person from Invoice00.csv / Invoice01.csv)
  console.log("Fixing Deal (Commission) Owners from Invoice Sales Person...")
  
  const processInvoices = async (filename) => {
    const path = `C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/${filename}`
    if (!fs.existsSync(path)) return
    
    const invCsv = fs.readFileSync(path, "utf8")
    const invRecords = parse(invCsv, { columns: true, skip_empty_lines: true, relax_quotes: true })
    
    let dealUpdates = 0
    for (const row of invRecords) {
      const invNum = row["Invoice Number"]
      const spName = row["Sales person"] || row["CF.SALESPERSON VIG"]
      if (!invNum || !spName) continue
      
      const ownerId = getOwnerId(spName)
      if (ownerId) {
         // Find Deal containing this invoice number in the name OR that matches the invoice zohoId logic
         // Usually Deal name is like: "Some Account | EST-1234" and Invoice Number is "INV-1234"
         const baseNum = invNum.replace('INV-', '')
         
         const deals = await prisma.deal.findMany({
            where: { name: { contains: baseNum } }
         })
         
         for (const d of deals) {
            if (d.ownerId !== ownerId) {
               await prisma.deal.update({ where: { id: d.id }, data: { ownerId } })
               dealUpdates++
            }
         }
      }
    }
    console.log(`Updated ${dealUpdates} deals to Sales person from ${filename}.`)
  }

  await processInvoices("Invoice00.csv")
  await processInvoices("Invoice01.csv")

  console.log("Fix complete!")
}

main().catch(console.error).finally(() => prisma.$disconnect())
