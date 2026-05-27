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

      for (const record of accounts) {
        // Upsert the sales rep / owner
        const ownerId = record.Owner.id
        const ownerName = record.Owner.name
        
        const owner = await prisma.user.upsert({
          where: { zohoId: ownerId },
          update: { name: ownerName },
          create: {
            zohoId: ownerId,
            name: ownerName,
            email: `${ownerId}@dummy.titandiamond.com`, // We need an email for Prisma unique constraint
          }
        })

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

        // Upsert the account
        await prisma.account.upsert({
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

        syncedCount++
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
