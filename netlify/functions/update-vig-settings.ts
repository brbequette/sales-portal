import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: "Method Not Allowed" }
  }

  try {
    const data = JSON.parse(event.body || "{}")
    const { action, repId, ...payload } = data

    if (!repId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "repId is required" }) }
    }

    if (action === "UPDATE_CONSTANT") {
      const { constantVigEnabled, constantVigValue } = payload
      
      const user = await prisma.user.update({
        where: { id: repId },
        data: {
          constantVigEnabled: !!constantVigEnabled,
          constantVigValue: constantVigValue !== null ? parseFloat(constantVigValue) : null
        }
      })
      
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, user }) }
    }

    if (action === "UPDATE_MONTHLY_GOAL") {
      const { monthKey, metric, profitGoal, subtotalGoal, manualVigRate } = payload
      
      if (!monthKey) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "monthKey is required" }) }
      }

      const goal = await prisma.monthlyVigGoal.upsert({
        where: {
          repId_monthKey: {
            repId,
            monthKey
          }
        },
        update: {
          metric: metric || "PROFIT",
          profitGoal: parseFloat(profitGoal) || 20000,
          subtotalGoal: parseFloat(subtotalGoal) || 40000,
          manualVigRate: manualVigRate !== null && manualVigRate !== undefined && manualVigRate !== "" ? parseFloat(manualVigRate) : null
        },
        create: {
          repId,
          monthKey,
          metric: metric || "PROFIT",
          profitGoal: parseFloat(profitGoal) || 20000,
          subtotalGoal: parseFloat(subtotalGoal) || 40000,
          manualVigRate: manualVigRate !== null && manualVigRate !== undefined && manualVigRate !== "" ? parseFloat(manualVigRate) : null
        }
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, goal }) }
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid action" }) }

  } catch (err: any) {
    console.error("Vig Setting Update Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
