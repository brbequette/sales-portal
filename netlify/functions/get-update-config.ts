import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

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
    // 1. Fetch settings from DB
    const settings = await prisma.systemSetting.findMany()
    const settingsMap = new Map(settings.map(s => [s.key, s.value]))

    const config = {
      timeframeMonths: parseInt(settingsMap.get("update_timeframe_months") || "12"),
      group1RepId: settingsMap.get("update_group_1_rep_id") || "",
      group2RepId: settingsMap.get("update_group_2_rep_id") || "",
      group3RepId: settingsMap.get("update_group_3_rep_id") || "",
      group4RepId: settingsMap.get("update_group_4_rep_id") || "",
    }

    // 2. Fetch all sales reps and admins (to assign)
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" }
    })

    // 3. Get count of "Update Status" accounts currently owned by each rep
    const updateCountsGrouped = await prisma.account.groupBy({
      by: ['ownerId'],
      where: { status: 'Update Status' },
      _count: { id: true }
    })

    const counts: Record<string, number> = {}
    users.forEach(u => {
      counts[u.id] = 0
    })
    updateCountsGrouped.forEach(item => {
      counts[item.ownerId] = item._count.id
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        config,
        users,
        counts
      })
    }

  } catch (error: any) {
    console.error("Get Update Config Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
