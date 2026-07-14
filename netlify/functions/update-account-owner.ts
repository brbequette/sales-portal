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

    const token = await getZohoAccessToken()
    const authHeaders = {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    }

    // 2. Update Account owner in Zoho CRM
    // Owner must be an object with id property in Zoho CRM v3+
    const accountPayload = {
      data: [
        {
          id: account.zohoId,
          Owner: { id: newOwner.zohoId }
        }
      ]
    }

    const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(accountPayload)
    })

    const crmData = await crmRes.json()

    if (!crmRes.ok || crmData.data?.[0]?.code !== "SUCCESS") {
      console.error("Zoho CRM Account Owner Update Failed:", JSON.stringify(crmData))
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

    // 3. Update all Contacts under this Account in Zoho CRM
    let contactsUpdated = 0
    let contactErrors: string[] = []
    try {
      // Search for contacts associated with this account
      const searchRes = await fetch(
        `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=(Account_Name.id:equals:${account.zohoId})&fields=id,Full_Name`,
        { headers: authHeaders }
      )

      if (searchRes.ok) {
        const searchData: any = await searchRes.json()
        const contacts = searchData.data || []

        if (contacts.length > 0) {
          // Batch update contacts in groups of 100 (Zoho API limit)
          for (let i = 0; i < contacts.length; i += 100) {
            const batch = contacts.slice(i, i + 100)
            const contactPayload = {
              data: batch.map((c: any) => ({
                id: c.id,
                Owner: { id: newOwner.zohoId }
              }))
            }

            const contactRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts`, {
              method: "PUT",
              headers: authHeaders,
              body: JSON.stringify(contactPayload)
            })

            const contactData: any = await contactRes.json()
            if (contactRes.ok && contactData.data) {
              for (const result of contactData.data) {
                if (result.code === "SUCCESS") {
                  contactsUpdated++
                } else {
                  contactErrors.push(`Contact ${result.details?.id || 'unknown'}: ${result.message}`)
                }
              }
            } else {
              contactErrors.push(`Batch update failed: ${JSON.stringify(contactData)}`)
            }
          }
        }
      }
    } catch (contactErr: any) {
      console.error("Contact owner update error (non-fatal):", contactErr.message)
      contactErrors.push(contactErr.message)
    }

    // 4. Update local database
    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: { ownerId: newOwnerId }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        account: updatedAccount,
        contactsUpdated,
        contactErrors: contactErrors.length > 0 ? contactErrors : undefined
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
