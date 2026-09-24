import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
import { isAdministratorRole } from "../../src/lib/roles"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

const authenticatedHandler: Handler = async (event) => {
  let actionId: string | undefined
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
    const sessionUser = await authenticateFunction(event)
    if (!isAdministratorRole(sessionUser.role)) {
      return {
        statusCode: 403,
        headers: cors,
        body: JSON.stringify({ success: false, message: "Only system administrators can reassign accounts" })
      }
    }

    const { accountId, newOwnerId, expectedOwnerId, requestId } = JSON.parse(event.body || "{}")

    if (!accountId || !newOwnerId || !expectedOwnerId || !requestId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, message: "Missing accountId, newOwnerId, expectedOwnerId, or requestId" })
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

    if (account.ownerId !== expectedOwnerId) {
      return {
        statusCode: 409,
        headers: cors,
        body: JSON.stringify({ success: false, code: "OWNER_CHANGED", message: "This account owner changed after the page loaded. Refresh before assigning it again." })
      }
    }

    if (!newOwner || !newOwner.zohoId) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ success: false, message: "New owner was not found or is not linked to Zoho CRM" })
      }
    }

    const actorId = sessionUser.dbId || sessionUser.userId
    const idempotencyKey = `account-owner:${actorId}:${requestId}`
    const priorAction = await prisma.operationalAction.findUnique({ where: { idempotencyKey } })
    if (priorAction) {
      const priorResult = priorAction.result && typeof priorAction.result === "object" ? priorAction.result : {}
      return {
        statusCode: priorAction.status === "SUCCEEDED" ? 200 : 409,
        headers: cors,
        body: JSON.stringify({ success: priorAction.status === "SUCCEEDED", duplicatePrevented: true, message: priorAction.status === "SUCCEEDED" ? "This ownership change was already completed." : "This ownership change is already being processed or previously failed.", ...priorResult })
      }
    }

    const action = await prisma.operationalAction.create({
      data: {
        idempotencyKey,
        actionType: "ACCOUNT_OWNER_REASSIGNMENT",
        entityType: "ACCOUNT",
        entityId: account.id,
        accountId: account.id,
        status: "RUNNING",
        payload: { previousOwnerId: account.ownerId, newOwnerId },
        actorId,
        attemptCount: 1,
        maxAttempts: 1,
        startedAt: new Date(),
      }
    })
    actionId = action.id

    const token = await getZohoAccessToken()
    const authHeaders = {
      "Authorization": `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    }

    // 2. Update Account owner in Zoho CRM
    // First try with stored zohoId; if invalid, search CRM by name to get real CRM Account ID
    let crmAccountId = account.zohoId
    
    const attemptOwnerUpdate = async (accountCrmId: string) => {
      const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`, { signal: AbortSignal.timeout(15000),
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
      console.warn(`Direct account owner update failed (${invalidMsg}); trying the bounded account lookup fallback`)
      
      try {
        const searchRes = await fetch(
          `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/search?criteria=(Account_Name:equals:${encodeURIComponent(account.name)})&fields=id,Account_Name,Owner`,
          { headers: authHeaders }
        )
        if (searchRes.ok) {
          const searchData: any = await searchRes.json()
          if (searchData.data && searchData.data.length > 0) {
            crmAccountId = searchData.data[0].id
            // Retry with the real CRM ID
            result = await attemptOwnerUpdate(crmAccountId)
            
            // Update local DB with correct CRM ID if different
            if (crmAccountId !== account.zohoId) {
              try {
                await prisma.account.update({
                  where: { id: accountId },
                  data: { zohoId: crmAccountId }
                })
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
      const detail = result.data.data?.[0]?.message || result.data.message || result.data.code || JSON.stringify(result.data)
      await prisma.operationalAction.update({ where: { id: action.id }, data: { status: "FAILED", errorCode: String(result.data.data?.[0]?.code || result.data.code || "ZOHO_OWNER_UPDATE_FAILED"), errorMessage: String(detail).slice(0, 1000), completedAt: new Date() } })
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ 
          success: false, 
          message: `Failed to update account owner in Zoho CRM: ${detail}`,
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
              const contactRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts`, { signal: AbortSignal.timeout(15000),
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
    const localUpdate = await prisma.account.updateMany({
      where: { id: accountId, ownerId: expectedOwnerId },
      data: { ownerId: newOwnerId }
    })
    if (localUpdate.count !== 1) {
      await prisma.operationalAction.update({ where: { id: action.id }, data: { status: "FAILED", errorCode: "LOCAL_OWNER_CONFLICT", errorMessage: "Local owner changed while the Zoho update was in progress", result: { zohoAccountUpdated: true, contactsUpdated, contactErrors }, completedAt: new Date() } })
      return { statusCode: 409, headers: cors, body: JSON.stringify({ success: false, partial: true, code: "LOCAL_OWNER_CONFLICT", message: "Zoho was updated, but the local owner changed concurrently. An administrator must review this account.", contactsUpdated, contactErrors }) }
    }

    const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
    const actionResult = { account: updatedAccount, contactsUpdated, contactErrors: contactErrors.length > 0 ? contactErrors : undefined, partial: contactErrors.length > 0 }
    await prisma.$transaction([
      prisma.operationalAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", result: actionResult, completedAt: new Date() } }),
      prisma.operationalEvent.create({ data: { entityType: "ACCOUNT", entityId: account.id, accountId: account.id, eventType: "ACCOUNT_OWNER_REASSIGNED", title: "Account owner reassigned", detail: contactErrors.length > 0 ? "Account owner updated with related-contact warnings" : "Account and related ownership updated", status: contactErrors.length > 0 ? "WARNING" : "SUCCESS", metadata: { previousOwnerId: expectedOwnerId, newOwnerId, contactsUpdated, contactErrorCount: contactErrors.length, requestId }, actorId } })
    ])

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        account: updatedAccount,
        contactsUpdated,
        contactErrors: contactErrors.length > 0 ? contactErrors : undefined,
        partial: contactErrors.length > 0
      })
    }

  } catch (error: any) {
    if (actionId) {
      await prisma.operationalAction.update({ where: { id: actionId }, data: { status: "FAILED", errorCode: "UNEXPECTED_ERROR", errorMessage: String(error?.message || error).slice(0, 1000), completedAt: new Date() } }).catch(() => undefined)
    }
    console.error("Account Owner Update Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, message: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
