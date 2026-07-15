import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { sourceType, sourceId, targetType, authorId } = body

    if (!sourceType || !sourceId || !targetType) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required fields" }) }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let originalData: any = null
    let estimateDateValue: string | null = null
    let customerId: string | null = null

    // 1. Fetch original document to extract Estimate Date custom field
    if (sourceType === "Quote") {
      const res = await fetch(`${baseUrl}/estimates/${sourceId}?organization_id=${ORG_ID}`, {
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
      const res = await fetch(`${baseUrl}/salesorders/${sourceId}?organization_id=${ORG_ID}`, {
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

    // 2. Prepare payload for target document
    if (sourceType === "Quote" && targetType === "SalesOrder") {
      createEndpoint = `${baseUrl}/salesorders?organization_id=${ORG_ID}&estimate_id=${sourceId}`
      payload = {
        customer_id: customerId,
        // Override the date if we found an estimate date
        date: estimateDateValue || undefined,
        custom_fields: estimateDateValue ? [{ label: "Estimate Date", value: estimateDateValue }] : []
      }
      resultKey = "salesorder"
    } else if (sourceType === "SalesOrder" && targetType === "Invoice") {
      createEndpoint = `${baseUrl}/invoices?organization_id=${ORG_ID}&salesorder_id=${sourceId}&ignore_auto_email=true`
      payload = {
        customer_id: customerId,
        is_draft: true,
        // Override the date if we found an estimate date
        date: estimateDateValue || undefined,
        custom_fields: estimateDateValue ? [{ label: "Estimate Date", value: estimateDateValue }] : []
      }
      resultKey = "invoice"
    } else {
      throw new Error("Invalid conversion path")
    }

    // 3. Create Target Document
    const res = await fetch(createEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json"
      },
      // When using &estimate_id or &salesorder_id, Zoho Books copies items. We only need to pass overrides in the body.
      body: JSON.stringify(payload)
    })
    
    const data = await res.json()
    if (data.code !== 0) {
      throw new Error(`Zoho Books Conversion Error: ${data.message}`)
    }

    const newDocId = data[resultKey][`${resultKey}_id`]

    // 4. Record to local database
    // We try to find the Account ID using the Zoho Customer ID
    const dbAccount = await prisma.account.findFirst({
      where: { zohoId: customerId || undefined }
    })

    if (dbAccount) {
      if (targetType === "SalesOrder") {
        await prisma.salesOrder.create({
          data: {
            zohoId: newDocId,
            accountId: dbAccount.id,
            amount: data[resultKey].total || 0,
            status: "Pending",
            orderDate: new Date(),
            items: []
          }
        })
      } else if (targetType === "Invoice") {
        await prisma.invoice.create({
          data: {
            zohoId: newDocId,
            accountId: dbAccount.id,
            amount: data[resultKey].total || 0,
            status: "Draft",
            issueDate: new Date(),
            items: []
          }
        })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, newDocumentId: newDocId, data: data[resultKey] })
    }

  } catch (err: any) {
    console.error("zoho-convert error:", err)
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
