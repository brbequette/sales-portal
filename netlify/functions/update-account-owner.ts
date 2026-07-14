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

    // 2. Update Account owner in Zoho CRM using the change_owner action
    const accountOwnerRes = await fetch(
      `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${account.zohoId}/actions/change_owner`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          owner: { id: newOwner.zohoId }
        })
      }
    )

    const accountOwnerData: any = await accountOwnerRes.json()

    if (!accountOwnerRes.ok || (accountOwnerData.data?.[0]?.code !== "SUCCESS" && accountOwnerData.status !== "success")) {
      console.error("Zoho CRM Account Owner Change Failed:", JSON.stringify(accountOwnerData))
      
      // Fallback: try regular PUT with Owner field
      const fallbackRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          data: [{ id: account.zohoId, Owner: { id: newOwner.zohoId } }]
        })
      })
      const fallbackData: any = await fallbackRes.json()
      
      if (!fallbackRes.ok || fallbackData.data?.[0]?.code !== "SUCCESS") {
        console.error("Zoho CRM Account Owner PUT Fallback Also Failed:", JSON.stringify(fallbackData))
        return {
          statusCode: 500,
          headers: cors,
          body: JSON.stringify({ 
            success: false, 
            message: "Failed to update account owner in Zoho CRM", 
            details: { changeOwner: accountOwnerData, putFallback: fallbackData }
          })
        }
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

        // Update each contact's owner
        for (const contact of contacts) {
          try {
            const contactOwnerRes = await fetch(
              `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/${contact.id}/actions/change_owner`,
              {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({
                  owner: { id: newOwner.zohoId }
                })
              }
            )
            
            if (contactOwnerRes.ok) {
              contactsUpdated++
            } else {
              // Fallback: try PUT
              const fallbackRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts`, {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify({
                  data: [{ id: contact.id, Owner: { id: newOwner.zohoId } }]
                })
              })
              const fallbackData: any = await fallbackRes.json()
              if (fallbackRes.ok && fallbackData.data?.[0]?.code === "SUCCESS") {
                contactsUpdated++
              } else {
                contactErrors.push(`Contact ${contact.Full_Name || contact.id}: ${fallbackData.data?.[0]?.message || 'failed'}`)
              }
            }
          } catch (e: any) {
            contactErrors.push(`Contact ${contact.id}: ${e.message}`)
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
