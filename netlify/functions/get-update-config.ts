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

    const usHolidays = [
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
      "2026-07-04", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
      "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18",
      "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24"
    ]

    const existingHolidays = settingsMap.get("holidays")
    let holidaysList: string[] = []
    // If setting is entirely missing, seed US government holidays
    if (existingHolidays === undefined) {
      holidaysList = usHolidays
      await prisma.systemSetting.upsert({
        where: { key: "holidays" },
        update: { value: JSON.stringify(usHolidays) },
        create: { key: "holidays", value: JSON.stringify(usHolidays) }
      })
    } else {
      holidaysList = JSON.parse(existingHolidays || "[]")
    }

    const config = {
      timeframeMonths: parseInt(settingsMap.get("update_timeframe_months") || "12"),
      group1RepId: settingsMap.get("update_group_1_rep_id") || "",
      group2RepId: settingsMap.get("update_group_2_rep_id") || "",
      group3RepId: settingsMap.get("update_group_3_rep_id") || "",
      group4RepId: settingsMap.get("update_group_4_rep_id") || "",
      holidays: holidaysList,
      salesTargets: JSON.parse(settingsMap.get("sales_targets") || "{}"),
    }

    // 2. Fetch all sales reps and admins (to assign)
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: [
            "bobby@titandiamond.net",
            "monty@titandiamond.net",
            "ross@titandiamond.net",
            "ben@titandiamond.net"
          ]
        }
      },
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
