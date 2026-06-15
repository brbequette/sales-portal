const fs = require("fs")
const { parse } = require("csv-parse/sync")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  console.log("Fixing Deal (Commission) Owners from Invoice Sales Person...")
  
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

  const processInvoices = async (filename) => {
    const path = `C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/${filename}`
    if (!fs.existsSync(path)) return
    
    console.log(`Processing ${filename}...`)
    const invCsv = fs.readFileSync(path, "utf8")
    const invRecords = parse(invCsv, { columns: true, skip_empty_lines: true, relax_quotes: true })
    
    let dealUpdates = 0
    // Batch processing to avoid massive queries
    const chunkSize = 100
    for (let i = 0; i < invRecords.length; i += chunkSize) {
      const chunk = invRecords.slice(i, i + chunkSize)
      await Promise.all(chunk.map(async (row) => {
        const invNum = row["Invoice Number"]
        const spName = row["Sales person"] || row["CF.SALESPERSON VIG"]
        if (!invNum || !spName) return
        
        const ownerId = getOwnerId(spName)
        if (ownerId) {
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
      }))
      console.log(`Processed ${Math.min(i + chunkSize, invRecords.length)} / ${invRecords.length} invoices. Updates so far: ${dealUpdates}`)
    }
    console.log(`Updated ${dealUpdates} deals to Sales person from ${filename}.`)
  }

  await processInvoices("Invoice00.csv")
  await processInvoices("Invoice01.csv")

  console.log("Fix complete!")
}

main().catch(console.error).finally(() => prisma.$disconnect())
