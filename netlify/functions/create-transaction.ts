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
    const { accountId, type, amount, items } = body

    if (!accountId || !type || amount === undefined) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing required fields" })
      }
    }

    let transaction;

    if (type === "Quote") {
      transaction = await prisma.quote.create({
        data: {
          accountId, // Note: front-end passes zohoId as accountId typically. We should check if this exists.
          amount,
          items: items || [],
          status: "Draft",
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      }).catch(async () => {
         // Fallback if accountId passed is zohoId
         const account = await prisma.account.findUnique({ where: { zohoId: accountId }});
         if (account) {
           return prisma.quote.create({
             data: {
               accountId: account.id,
               amount,
               items: items || [],
             }
           })
         }
         throw new Error("Account not found");
      })
    } else if (type === "SalesOrder") {
      transaction = await prisma.salesOrder.create({
        data: {
          accountId,
          amount,
          items: items || [],
          status: "Pending",
        }
      }).catch(async () => {
         // Fallback if accountId passed is zohoId
         const account = await prisma.account.findUnique({ where: { zohoId: accountId }});
         if (account) {
           return prisma.salesOrder.create({
             data: {
               accountId: account.id,
               amount,
               items: items || [],
             }
           })
         }
         throw new Error("Account not found");
      })
    } else {
       return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid type" }) }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, transaction })
    }

  } catch (error: any) {
    console.error('Create Transaction Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
