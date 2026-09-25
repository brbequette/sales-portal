import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { authorizeDocumentAccess } from "./lib/document-access"
import { assertNoBooksConflictBeforeWrite } from "../../src/lib/sync-engine"
import { buildSalesOrderFromQuotePayload, sanitizedProviderFailure } from "../../src/lib/zoho-document-conversion"
import { createHash } from "node:crypto"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event, context) => {
  const headers = { "Content-Type": "application/json" }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  let sessionUser
  try {
    sessionUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, headers)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { sourceType, sourceId, targetType, authorId } = body

    if (!sourceType || !sourceId || !targetType) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required fields" }) }
    }
    const documentKind = sourceType === "Quote" ? "quote" : sourceType === "SalesOrder" ? "salesOrder" : null
    if (!documentKind) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid source type" }) }
    }

    const access = await authorizeDocumentAccess(sessionUser, documentKind, { id: sourceId })
    if (!access.authorized) {
      return { statusCode: 403, body: JSON.stringify({ success: false, message: "You can only convert documents belonging to your accounts" }) }
    }

    let localSource: any = null
    if (documentKind === "quote") {
      const source = await prisma.quote.findFirst({ where: { OR: [{ id: sourceId }, { zohoId: sourceId }] } })
      if (!source) return { statusCode: 404, body: JSON.stringify({ success: false, message: "Estimate not found" }) }
      await assertNoBooksConflictBeforeWrite("quote", source)
      localSource = source
    } else {
      const source = await prisma.salesOrder.findFirst({ where: { OR: [{ id: sourceId }, { zohoId: sourceId }] } })
      if (!source) return { statusCode: 404, body: JSON.stringify({ success: false, message: "Sales order not found" }) }
      await assertNoBooksConflictBeforeWrite("salesorder", source)
      localSource = source
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    const booksSourceId = String(localSource?.zohoId || '').trim()
    if (!booksSourceId) {
      return { statusCode: 409, body: JSON.stringify({ success: false, message: "The source document is not linked to an authoritative Zoho Books record." }) }
    }

    let originalData: any = null
    let estimateDateValue: string | null = null
    let customerId: string | null = null

    // 1. Fetch original document to extract Estimate Date custom field
    if (sourceType === "Quote") {
      const res = await fetch(`${baseUrl}/estimates/${booksSourceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const data = await res.json()
      if (data.code !== 0) throw new Error(`Zoho Books Error: ${data.message}`)
      originalData = data.estimate
      customerId = originalData.customer_id
      
      const cfs = originalData.custom_fields || []
      const dateCf = cfs.find((cf: any) => cf.label?.toLowerCase() === "estimate date")
      if (dateCf) estimateDateValue = dateCf.value
    } else if (sourceType === "SalesOrder") {
      const res = await fetch(`${baseUrl}/salesorders/${booksSourceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const data = await res.json()
      if (data.code !== 0) throw new Error(`Zoho Books Error: ${data.message}`)
      originalData = data.salesorder
      customerId = originalData.customer_id

      const cfs = originalData.custom_fields || []
      const dateCf = cfs.find((cf: any) => cf.label?.toLowerCase() === "estimate date")
      if (dateCf) estimateDateValue = dateCf.value
    } else {
      throw new Error("Invalid source type")
    }

    let payload: any = {}
    let createEndpoint = ""
    let resultKey = ""
    let providerOperationKey: string | null = null

    // 2. Prepare payload for target document
    if (sourceType === "Quote" && targetType === "SalesOrder") {
      // Zoho's current create-sales-order contract links the source via the
      // estimate_id request field. The former query-string shortcut submitted
      // neither line_items nor a documented conversion payload and was rejected.
      createEndpoint = `${baseUrl}/salesorders?organization_id=${ORG_ID}`
      payload = buildSalesOrderFromQuotePayload(originalData)
      resultKey = "salesorder"
    } else if (sourceType === "SalesOrder" && targetType === "Invoice") {
      createEndpoint = `${baseUrl}/invoices?organization_id=${ORG_ID}&salesorder_id=${booksSourceId}&ignore_auto_email=true`
      payload = {
        customer_id: customerId,
        is_draft: true,
        // Override the date to match the Sales Order date
        date: originalData?.date || undefined,
        custom_fields: estimateDateValue ? [{ label: "Estimate Date", value: estimateDateValue }] : []
      }
      resultKey = "invoice"
    } else {
      throw new Error("Invalid conversion path")
    }

    const sourceStatus = String(originalData?.status || "").trim().toUpperCase()
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ sourceType, booksSourceId, sourceStatus, targetType, payload }))
      .digest("hex")
    const operationKey = `books:document:convert:${sourceType}:${localSource.id}:${targetType}`
    providerOperationKey = operationKey
    const operation = await prisma.providerWriteOperation.upsert({
      where: { operationKey },
      update: {},
      create: {
        operationKey,
        provider: "ZOHO_BOOKS",
        entityType: sourceType,
        entityId: localSource.id,
        operation: `CONVERT_TO_${targetType.toUpperCase()}`,
        requestFingerprint,
      },
    })
    if (operation.requestFingerprint !== requestFingerprint) {
      if (operation.state !== "FAILED") {
        return { statusCode: 409, body: JSON.stringify({ success: false, providerState: operation.state, message: "The source document changed after conversion was prepared. Review it before trying again." }) }
      }
      const reopened = await prisma.providerWriteOperation.updateMany({
        where: { operationKey, state: "FAILED", requestFingerprint: operation.requestFingerprint },
        data: {
          requestFingerprint,
          state: "PENDING",
          providerCode: null,
          providerMessage: null,
          providerRecordIds: undefined,
          lastError: null,
          completedAt: null,
        },
      })
      if (reopened.count !== 1) {
        return { statusCode: 409, body: JSON.stringify({ success: false, providerState: "FAILED", message: "The failed conversion changed concurrently and was not retried." }) }
      }
    }
    if (operation.state === "SUCCEEDED") {
      const prior = operation.providerRecordIds as { newDocumentId?: string } | null
      return { statusCode: 200, body: JSON.stringify({ success: true, alreadyProcessed: true, newDocumentId: prior?.newDocumentId || null }) }
    }
    if (operation.state === "SYNCING" || operation.state === "AMBIGUOUS") {
      return { statusCode: 202, body: JSON.stringify({ success: false, providerState: operation.state, message: "This conversion is already in progress or has an unknown provider outcome. It was not resubmitted." }) }
    }
    if (operation.state === "FAILED" && operation.requestFingerprint === requestFingerprint) {
      return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", code: operation.providerCode, message: operation.providerMessage || "The prior conversion failed and was not retried automatically." }) }
    }
    const claimed = await prisma.providerWriteOperation.updateMany({
      where: { operationKey, state: "PENDING" },
      data: { state: "SYNCING", attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    })
    if (claimed.count !== 1) {
      return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "SYNCING", message: "This conversion is already being processed." }) }
    }

    // 3. Create Target Document
    let res: Response
    let data: any
    try {
      res = await fetch(createEndpoint, { signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      data = await res.json().catch(() => null)
    } catch (providerError: any) {
      const message = String(providerError?.message || providerError || "Unknown Books conversion error")
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", lastError: message, providerMessage: "Conversion outcome is unknown; reconciliation is required before retry." } })
      return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books conversion outcome is unknown and was not retried." }) }
    }
    if (!res.ok || data?.code !== 0) {
      const failure = sanitizedProviderFailure(res.status, data)
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "FAILED", providerCode: failure.code, providerMessage: failure.message, lastError: failure.message, completedAt: new Date() } })
      return { statusCode: 422, body: JSON.stringify({ success: false, providerState: "FAILED", ...failure }) }
    }

    const newDocId = data?.[resultKey]?.[`${resultKey}_id`]
    if (!newDocId) {
      await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerCode: String(data?.code ?? 0), providerMessage: "Provider accepted the conversion without returning a document ID.", lastError: "Provider document ID missing after acceptance." } })
      return { statusCode: 202, body: JSON.stringify({ success: false, providerState: "AMBIGUOUS", message: "Books accepted the conversion without a document ID; reconciliation is required." }) }
    }
    await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: "AMBIGUOUS", providerRecordIds: { newDocumentId: String(newDocId) }, providerCode: String(data.code), providerMessage: String(data.message || "success"), lastError: "Provider accepted; local persistence is pending." } })

    // 4. Record to local database
    // We try to find the Account ID using the Zoho Customer ID
    const dbAccount = await prisma.account.findFirst({
      where: { OR: [{ booksCustomerId: customerId || undefined }, { zohoId: customerId || undefined }] }
    })

    if (dbAccount) {
      if (targetType === "SalesOrder") {
        await prisma.salesOrder.create({
          data: {
            zohoId: newDocId,
            accountId: dbAccount.id,
            amount: data[resultKey].total || 0,
            status: "Pending",
            orderDate: data[resultKey].date ? new Date(data[resultKey].date) : new Date(),
            items: { ...(data[resultKey] || {}), line_items: data[resultKey]?.line_items || originalData?.line_items || [] }
          }
        })
      } else if (targetType === "Invoice") {
        await prisma.invoice.create({
          data: {
            zohoId: newDocId,
            accountId: dbAccount.id,
            amount: data[resultKey].total || 0,
            status: "Draft",
            issueDate: data[resultKey].date ? new Date(data[resultKey].date) : (originalData?.date ? new Date(originalData.date) : new Date()),
            items: []
          }
        })
      }
    }

    await prisma.providerWriteOperation.update({ where: { operationKey: providerOperationKey }, data: { state: "SUCCEEDED", providerRecordIds: { newDocumentId: String(newDocId) }, completedAt: new Date(), lastError: null } })

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, newDocumentId: newDocId, data: data[resultKey] })
    }

  } catch (err: any) {
    console.error("zoho-convert error:", err)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
