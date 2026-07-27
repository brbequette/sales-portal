import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    // Find accounts with lastPurchaseAt older than 90 days or missing
    const inactiveAccounts = await prisma.account.findMany({
      where: {
        OR: [
          { lastPurchaseAt: { lt: ninetyDaysAgo } },
          { lastPurchaseAt: null }
        ],
      },
      take: 100,
      select: {
        id: true,
        zohoId: true,
        name: true,
        quality: true,
        lastPurchaseAt: true,
        ownerId: true,
      }
    })

    const defaultUser = await prisma.user.findFirst()
    if (!defaultUser) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "No users found in database" }) }
    }

    let createdTasks = 0
    for (const acc of inactiveAccounts) {
      const existingTask = await prisma.task.findFirst({
        where: {
          accountId: acc.id,
          subject: { contains: "90+ Day Inactive Re-engagement" },
          status: { not: "Completed" }
        }
      })

      if (!existingTask) {
        await prisma.task.create({
          data: {
            zohoId: `REENGAGE_${acc.zohoId}_${Date.now()}`,
            subject: `90+ Day Inactive Re-engagement: ${acc.name}`,
            description: `Automated Campaign: Account ${acc.name} has had no blade orders in over 90 days. Offer complimentary manufacturer sample blade to rebuild relationship.`,
            status: "Pending",
            priority: "High",
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Due in 2 days
            accountId: acc.id,
            ownerId: acc.ownerId || defaultUser.id,
          }
        })
        createdTasks++
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        message: `Re-engagement campaign audit complete. Processed ${inactiveAccounts.length} inactive accounts. Created ${createdTasks} new re-engagement tasks.`,
        inactiveCount: inactiveAccounts.length,
        createdTasksCount: createdTasks,
      })
    }
  } catch (err: any) {
    console.error("Re-engagement Campaign Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message })
    }
  }
}
