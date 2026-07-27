import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
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
        body: JSON.stringify({ success: false, message: `New owner not found or missing Zoho User ID. Owner: ${newOwner?.name || 'not found'}, zohoId: ${newOwner?.zohoId || 'empty'}` })
      }
    }

    const token = await getZohoAccessToken()
    const authHeaders = {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    }

    // 2. Update Account owner in Zoho CRM
    // First try with stored zohoId; if invalid, search CRM by name to get real CRM Account ID
    let crmAccountId = account.zohoId
    
    const attemptOwnerUpdate = async (accountCrmId: string) => {
      const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          data: [{ id: accountCrmId, Owner: newOwner.zohoId }]
        })
      })
      const crmData: any = await crmRes.json()
      return { ok: crmRes.ok, data: crmData }
    }

    let result = await attemptOwnerUpdate(crmAccountId)

    // If ID is invalid, search CRM by account name to find the real CRM Account ID
    if (!result.ok || result.data.data?.[0]?.code !== "SUCCESS") {
      const invalidMsg = result.data.data?.[0]?.message || result.data.message || ""
      console.log(`Direct update failed (${invalidMsg}), searching CRM for account: ${account.name}`)
      
      try {
        const searchRes = await fetch(
          `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/search?criteria=(Account_Name:equals:${encodeURIComponent(account.name)})&fields=id,Account_Name,Owner`,
          { headers: authHeaders }
        )
        if (searchRes.ok) {
          const searchData: any = await searchRes.json()
          if (searchData.data && searchData.data.length > 0) {
            crmAccountId = searchData.data[0].id
            console.log(`Found CRM Account ID: ${crmAccountId} for "${account.name}"`)
            
            // Retry with the real CRM ID
            result = await attemptOwnerUpdate(crmAccountId)
            
            // Update local DB with correct CRM ID if different
            if (crmAccountId !== account.zohoId) {
              try {
                await prisma.account.update({
                  where: { id: accountId },
                  data: { zohoId: crmAccountId }
                })
                console.log(`Updated local zohoId from ${account.zohoId} to ${crmAccountId}`)
              } catch (e) {
                console.error("Failed to update local zohoId:", e)
              }
            }
          }
        }
      } catch (searchErr) {
        console.error("CRM search fallback error:", searchErr)
      }
    }

    if (!result.ok || result.data.data?.[0]?.code !== "SUCCESS") {
      console.error("Zoho CRM Account Owner Update Failed:", JSON.stringify(result.data))
      const detail = result.data.data?.[0]?.message || result.data.message || result.data.code || JSON.stringify(result.data)
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ 
          success: false, 
          message: `Failed to update account owner in Zoho CRM: ${detail}`,
          details: result.data 
        })
      }
    }

    // 3. Update all Contacts under this Account in Zoho CRM
    let contactsUpdated = 0
    let contactErrors: string[] = []
    try {
      const searchRes = await fetch(
        `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=(Account_Name.id:equals:${crmAccountId})&fields=id,Full_Name`,
        { headers: authHeaders }
      )

      if (searchRes.ok && searchRes.status !== 204) {
        const searchData: any = await searchRes.json()
        const contacts = searchData.data || []

        if (contacts.length > 0) {
          // Batch update contacts in groups of 100 (Zoho API limit)
          for (let i = 0; i < contacts.length; i += 100) {
            const batch = contacts.slice(i, i + 100)
            try {
              const contactRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts`, {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify({
                  data: batch.map((c: any) => ({
                    id: c.id,
                    Owner: newOwner.zohoId
                  }))
                })
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
              }
            } catch (e: any) {
              contactErrors.push(`Batch error: ${e.message}`)
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

