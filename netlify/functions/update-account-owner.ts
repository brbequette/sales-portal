import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';

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
    const { accountId, newOwnerId } = JSON.parse(event.body || "{}")

    if (!accountId || !newOwnerId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, message: "Missing accountId or newOwnerId" })
      }
    }

    // 1. Get the account and new owner
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    })

    const newOwner = await prisma.user.findUnique({
      where: { id: newOwnerId }
    })

    if (!account || !account.zohoId) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ success: false, message: "Account not found or missing zohoId" })
      }
    }

    if (!newOwner || !newOwner.zohoId) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ success: false, message: "New owner not found or missing zohoId" })
      }
    }

    // 2. Update Zoho CRM
    const token = await getZohoAccessToken()
    
    // In Zoho CRM v3, to update a record owner, you just PUT to /Accounts with the Owner field
    const zohoUpdatePayload = {
      data: [
        {
          id: account.zohoId,
          Owner: newOwner.zohoId
        }
      ]
    }

    const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, {
      method: "PUT",
      headers: {
        "Authorization": `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(zohoUpdatePayload)
    })

    const crmData = await crmRes.json()

    if (!crmRes.ok || crmData.data?.[0]?.code !== "SUCCESS") {
      console.error("Zoho CRM Account Owner Update Failed:", crmData)
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ 
          success: false, 
          message: "Failed to update account owner in Zoho CRM", 
          details: crmData 
        })
      }
    }

    // 3. Update local database
    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: { ownerId: newOwnerId }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        account: updatedAccount
      })
    }

  } catch (error: any) {
    console.error("Account Owner Update Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, message: error.message })
    }
  }
}
