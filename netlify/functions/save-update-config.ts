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

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { timeframeMonths, group1RepId, group2RepId, group3RepId, group4RepId, holidays, salesTargets, subtotalTargets } = body

    const settingsToSave = [
      { key: "update_timeframe_months", value: String(timeframeMonths || 12) },
      { key: "update_group_1_rep_id", value: group1RepId || "" },
      { key: "update_group_2_rep_id", value: group2RepId || "" },
      { key: "update_group_3_rep_id", value: group3RepId || "" },
      { key: "update_group_4_rep_id", value: group4RepId || "" },
      { key: "holidays", value: JSON.stringify(holidays || []) },
      { key: "sales_targets", value: JSON.stringify(salesTargets || {}) },
      { key: "subtotal_targets", value: JSON.stringify(subtotalTargets || {}) },
    ]

    for (const item of settingsToSave) {
      await prisma.systemSetting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: { key: item.key, value: item.value }
      })
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, message: "Settings saved successfully" })
    }

  } catch (error: any) {
    console.error("Save Update Config Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
