import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const sessionUser = await authenticateFunction(event)
    const administrator = isAdminRole(sessionUser.role)
    const params = event.queryStringParameters || {}
    const visibleOnly = params.visibleOnly === "true"

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { NOT: { email: { contains: "dummy.titandiamond.com" } } },
          { NOT: { email: { contains: "example.com" } } },
          { NOT: { name: { contains: "test_migration" } } }
        ]
      },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true,
        zohoId: true,
        showOnSalesBoard: true,
        monthlyVigGoals: { select: { id: true, monthKey: true, profitGoal: true } },
      },
      orderBy: { name: "asc" }
    })

    let filtered = users
    if (visibleOnly) {
      const visibleRepsSetting = await prisma.systemSetting.findUnique({ where: { key: "visible_reps" } })
      const visibleReps: string[] = JSON.parse(visibleRepsSetting?.value || "[]")
      if (visibleReps.length > 0) {
        filtered = users.filter(u => visibleReps.includes(u.id))
      }
    }

    const responseUsers = administrator
      ? filtered
      : filtered.map(user => ({
          id: user.id,
          name: user.name,
          role: user.role,
          zohoId: user.zohoId,
          showOnSalesBoard: user.showOnSalesBoard,
        }))

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, users: responseUsers })
    }
  } catch (error: any) {
    console.error("Get Users Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
