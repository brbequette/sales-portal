import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  try {
    // Fetch all accounts
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true }
    })

    let updatedCount = 0
    const details = []

    for (const account of accounts) {
      // Find the latest call note for this account
      const latestCallNote = await prisma.note.findFirst({
        where: {
          accountId: account.id,
          OR: [
            { callSid: { not: null } },
            { content: { contains: "Call" } },
            { content: { contains: "📞" } },
          ]
        },
        orderBy: { createdAt: "desc" }
      })

      if (latestCallNote) {
        await prisma.account.update({
          where: { id: account.id },
          data: { lastCalledAt: latestCallNote.createdAt }
        })
        updatedCount++
        details.push({ accountName: account.name, lastCalled: latestCallNote.createdAt })
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, message: `Successfully backfilled ${updatedCount} accounts.`, details })
    }
  } catch (err: any) {
    console.error("Backfill error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
