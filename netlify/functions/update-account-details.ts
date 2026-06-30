import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  if (event.httpMethod !== "POST" && event.httpMethod !== "PATCH") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountId, name, industry, timeZone, tags, quality, status, billingStreet, billingCity, billingState, billingZip } = body

    if (!accountId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: "accountId is required" })
      }
    }

    // Find account by ID or zohoId
    let account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      account = await prisma.account.findUnique({ where: { zohoId: accountId } })
    }

    if (!account) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: "Account not found" }) }
    }

    const dataToUpdate: any = {}
    if (name !== undefined) dataToUpdate.name = name
    if (industry !== undefined) dataToUpdate.industry = industry
    if (timeZone !== undefined) dataToUpdate.timeZone = timeZone
    if (tags !== undefined) dataToUpdate.tags = tags
    if (quality !== undefined) dataToUpdate.quality = quality
    if (status !== undefined) dataToUpdate.status = status
    if (billingStreet !== undefined) dataToUpdate.billingStreet = billingStreet
    if (billingCity !== undefined) dataToUpdate.billingCity = billingCity
    if (billingState !== undefined) dataToUpdate.billingState = billingState
    if (billingZip !== undefined) dataToUpdate.billingZip = billingZip

    const updatedAccount = await prisma.account.update({
      where: { id: account.id },
      data: dataToUpdate
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, account: updatedAccount })
    }

  } catch (error: any) {
    console.error("Error updating account details:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: "Internal Server Error" })
    }
  }
}
