import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

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
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  try {
    if (event.httpMethod === "GET") {
      const users = await prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          zohoId: true,
          canSendCampaigns: true,
          showOnSalesBoard: true,
          payoutStructure: true,
          permissions: true,
          _count: { select: { accounts: true } }
        }
      })
      const mapped = users.map(u => ({ ...u, accountCount: (u as any)._count?.accounts || 0, _count: undefined }))
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, users: mapped }) }
    }

    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}")
      const { id, canSendCampaigns, showOnSalesBoard, permissions, role, name, email, zohoId, payoutStructure } = body

      if (!id) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing user ID" }) }
      }

      const updateData: any = {}
      if (canSendCampaigns !== undefined) updateData.canSendCampaigns = canSendCampaigns
      if (showOnSalesBoard !== undefined) updateData.showOnSalesBoard = showOnSalesBoard
      if (permissions !== undefined) updateData.permissions = permissions
      if (role !== undefined) updateData.role = role
      if (name !== undefined) updateData.name = name
      if (email !== undefined) updateData.email = email
      if (zohoId !== undefined) updateData.zohoId = zohoId || null
      if (payoutStructure !== undefined) updateData.payoutStructure = payoutStructure

      const user = await prisma.user.update({
        where: { id },
        data: updateData
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, user }) }
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { name, email, role, zohoId, permissions, payoutStructure } = body

      if (!email) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Email is required" }) }
      }

      const newUser = await prisma.user.create({
        data: {
          name: name || email.split("@")[0],
          email,
          role: role || "Sales Representative",
          zohoId: zohoId || null,
          permissions: permissions || undefined,
          payoutStructure: payoutStructure || "two_payment",
        }
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, user: newUser }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err: any) {
    console.error("Admin Users Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
