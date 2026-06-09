import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { action, payload } = body

    if (action === 'SYNC_ACCOUNTS') {
      const accounts = payload.data || []
      let syncedCount = 0

      // Prefetch unique owners to minimize DB calls
      const ownerIds = Array.from(new Set(accounts.map((r: any) => r.Owner?.id).filter(Boolean))) as string[]
      const existingOwners = await prisma.user.findMany({
        where: { zohoId: { in: ownerIds } }
      })
      const ownerMap = new Map(existingOwners.map(u => [u.zohoId, u]))

      // Identify missing owners and upsert them in a batch transaction
      const missingOwnersToUpsert = []
      for (const record of accounts) {
        if (!record.Owner?.id) continue;
        const ownerId = record.Owner.id
        const ownerName = record.Owner.name
        
        if (!ownerMap.has(ownerId)) {
          missingOwnersToUpsert.push({ ownerId, ownerName })
          // Temporarily set a dummy user in map to prevent duplicate inserts in same batch
          ownerMap.set(ownerId, {} as any)
        }
      }

      if (missingOwnersToUpsert.length > 0) {
        const userUpsertOps = missingOwnersToUpsert.map(u => 
          prisma.user.upsert({
            where: { zohoId: u.ownerId },
            update: { name: u.ownerName },
            create: {
              zohoId: u.ownerId,
              name: u.ownerName,
              email: `${u.ownerId}@dummy.titandiamond.com`
            }
          })
        )
        const upsertedUsers = await prisma.$transaction(userUpsertOps)
        upsertedUsers.forEach(u => ownerMap.set(u.zohoId!, u))
      }

      const accountOps = []
      for (const record of accounts) {
        if (!record.Owner?.id) continue;
        const ownerId = record.Owner.id
        const owner = ownerMap.get(ownerId)
        if (!owner || !owner.id) continue;

        // Determine Update Status logic (pseudo logic based on Last_Sale_Date if available)
        let status = 'Open'
        const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null
        
        if (lastPurchaseDate) {
          const twelveMonthsAgo = new Date()
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
          
          if (lastPurchaseDate < twelveMonthsAgo) {
            status = 'Update Status'
          } else {
            status = 'Personal' // Recently bought
          }
        }

        accountOps.push(
          prisma.account.upsert({
            where: { zohoId: record.id },
            update: {
              name: record.Account_Name,
              industry: record.Industry,
              status: status,
              lastPurchaseAt: lastPurchaseDate,
              ownerId: owner.id,
            },
            create: {
              zohoId: record.id,
              name: record.Account_Name,
              industry: record.Industry,
              status: status,
              lastPurchaseAt: lastPurchaseDate,
              ownerId: owner.id,
            }
          })
        )
      }

      // Execute in transaction batches of 50 to minimize connection pool usage
      for (let i = 0; i < accountOps.length; i += 50) {
        const chunk = accountOps.slice(i, i + 50)
        await prisma.$transaction(chunk)
        syncedCount += chunk.length
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: `Synced ${syncedCount} accounts.` })
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Unknown action' })
    }

  } catch (error: any) {
    console.error('Zoho Sync Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
