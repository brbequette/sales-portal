import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { getStore } from "@netlify/blobs"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

// How long a cached PDF is considered valid before re-fetching from Zoho
// For paid/void invoices: 30 days (they never change)
// For open/draft invoices: 24 hours (may get updated)
const OPEN_PDF_TTL_MS = 24 * 60 * 60 * 1000       // 24 hours
const CLOSED_PDF_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function getPdfTtl(status: string): number {
  const s = (status || '').toLowerCase()
  if (s === 'paid' || s === 'void' || s === 'voided' || s === 'writeoff') return CLOSED_PDF_TTL_MS
  return OPEN_PDF_TTL_MS
}

function getBlobKey(type: string, booksDocId: string): string {
  const t = type === 'SalesOrder' ? 'so' : type === 'Quote' ? 'qte' : 'inv'
  return `pdf/${t}/${booksDocId}`
}

const authenticatedHandler: Handler = async (event) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const { id, type = "Invoice", booksInvoiceId: queryBooksId, download, force } = event.queryStringParameters || {}

    let booksDocId = queryBooksId || id
    let dbDoc: any = null

    // ── Step 1: Resolve the Zoho Books ID from DB ──
    if (!queryBooksId && id) {
      if (type === "Invoice") {
        dbDoc = await prisma.invoice.findFirst({ where: { OR: [{ id }, { zohoId: id }] } })
      } else if (type === "SalesOrder") {
        dbDoc = await prisma.salesOrder.findFirst({ where: { OR: [{ id }, { zohoId: id }] } })
      } else if (type === "Quote") {
        dbDoc = await prisma.quote.findFirst({ where: { OR: [{ id }, { zohoId: id }] } })
      }

      if (dbDoc) {
        const items = dbDoc.items as any
        if (items?.booksInvoiceId) booksDocId = items.booksInvoiceId
        else if (items?.booksSalesOrderId) booksDocId = items.booksSalesOrderId
        else if (items?.booksEstimateId) booksDocId = items.booksEstimateId
        else if (items?.invoiceNumber && type === "Invoice") {
          // Search Books by invoice number
          let searchNum = items.invoiceNumber
          if (typeof searchNum === 'string' && searchNum.includes('|')) searchNum = searchNum.split('|').pop()?.trim()
          else if (typeof searchNum === 'string' && searchNum.startsWith('INV-')) searchNum = searchNum.substring(4).trim()
          try {
            const token = await getZohoAccessToken()
            const searchRes = await fetch(
              `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&invoice_number=${searchNum}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
            )
            if (searchRes.ok) {
              const searchData: any = await searchRes.json()
              if (searchData.invoices?.length > 0) {
                booksDocId = searchData.invoices[0].invoice_id
                items.booksInvoiceId = booksDocId
                await prisma.invoice.update({ where: { id: dbDoc.id }, data: { items } })
              }
            }
          } catch (e) { console.error("Failed number search", e) }
        }

        // Try number-based search as last resort before giving up
        if (!booksDocId && dbDoc.zohoId) {
          const items = dbDoc.items as any
          const docNumber = items?.invoiceNumber || items?.salesOrderNumber || items?.estimateNumber
          if (docNumber) {
            let searchNum = typeof docNumber === 'string' && docNumber.includes('|') ? docNumber.split('|').pop()?.trim() : docNumber
            if (typeof searchNum === 'string' && searchNum.startsWith('INV-')) searchNum = searchNum.substring(4).trim()
            try {
              const token = await getZohoAccessToken()
              const modPath = type === 'SalesOrder' ? 'salesorders' : type === 'Quote' ? 'estimates' : 'invoices'
              const paramName = type === 'SalesOrder' ? 'salesorder_number' : type === 'Quote' ? 'estimate_number' : 'invoice_number'
              const searchRes = await fetch(
                `https://www.zohoapis.${ZOHO_DC}/books/v3/${modPath}?organization_id=${ORG_ID}&${paramName}=${searchNum}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
              )
              if (searchRes.ok) {
                const searchData: any = await searchRes.json()
                const results = searchData[modPath]
                if (results?.length > 0) {
                  const idField = type === 'SalesOrder' ? 'salesorder_id' : type === 'Quote' ? 'estimate_id' : 'invoice_id'
                  booksDocId = results[0][idField]
                }
              }
            } catch (e) { console.error('Fallback number search failed', e) }
          }
          if (!booksDocId) {
            return {
              statusCode: 404,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
              body: JSON.stringify({ success: false, message: `Cannot resolve a Zoho Books ID for this ${type}` })
            }
          }
        }
      }
    }

    if (!booksDocId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
        body: JSON.stringify({ success: false, message: `Missing document ID for ${type}` })
      }
    }

    // ── Step 2: Check Netlify Blobs cache (skip on force=true) ──
    let pdfBuffer: Buffer | null = null
    let servedFromCache = false

    if (force !== 'true') {
      try {
        const store = getStore({ name: "invoice-pdfs", consistency: "strong" })
        const blobKey = getBlobKey(type, booksDocId)
        const blob = await store.getWithMetadata(blobKey, { type: "arrayBuffer" })

        if (blob && blob.data) {
          // Check TTL using stored metadata
          const cachedAt = blob.metadata?.cachedAt as number | undefined
          const docStatus = blob.metadata?.status as string || 'open'
          const ttl = getPdfTtl(docStatus)

          if (cachedAt && (Date.now() - cachedAt) < ttl) {
            console.log(`PDF cache hit for ${type} ${booksDocId} (cached ${Math.round((Date.now() - cachedAt) / 60000)}m ago)`)
            pdfBuffer = Buffer.from(blob.data as ArrayBuffer)
            servedFromCache = true
          } else {
            console.log(`PDF cache expired for ${type} ${booksDocId} — re-fetching from Zoho`)
          }
        }
      } catch (blobErr) {
        // Blob store unavailable (e.g. local dev) — just fall through to Zoho
        console.warn("Blob store unavailable, fetching from Zoho:", (blobErr as any).message)
      }
    }

    // ── Step 3: Fetch from Zoho Books if not cached ──
    if (!pdfBuffer) {
      console.log(`Fetching PDF for Zoho Books ${type} ID: ${booksDocId}`)
      const token = await getZohoAccessToken()

      let modulePath = "invoices"
      if (type === "SalesOrder") modulePath = "salesorders"
      else if (type === "Quote") modulePath = "estimates"

      // Try multiple Zoho PDF endpoint patterns
      const attempts = [
        `https://www.zohoapis.${ZOHO_DC}/books/v3/${modulePath}/${booksDocId}?organization_id=${ORG_ID}&accept=pdf`,
        `https://www.zohoapis.${ZOHO_DC}/books/v3/${modulePath}/${booksDocId}?organization_id=${ORG_ID}`,
        `https://www.zohoapis.${ZOHO_DC}/books/v3/${modulePath}/${booksDocId}/print?organization_id=${ORG_ID}`,
      ]

      let pdfRes: Response | null = null
      for (const url of attempts) {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/pdf' }
        })
        const ct = res.headers.get('content-type') || ''
        if (res.ok && ct.includes('pdf')) {
          pdfRes = res
          break
        }
        // Drain the body to avoid memory leak
        await res.text().catch(() => {})
      }

      if (!pdfRes) {
        return {
          statusCode: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
          body: JSON.stringify({ success: false, message: "Failed to download PDF from Zoho Books after all attempts" })
        }
      }

      const arrayBuffer = await pdfRes.arrayBuffer()
      pdfBuffer = Buffer.from(arrayBuffer)

      // ── Step 4: Store in Netlify Blobs ──
      try {
        const store = getStore({ name: "invoice-pdfs", consistency: "strong" })
        const blobKey = getBlobKey(type, booksDocId)
        const docStatus = dbDoc?.status || 'open'

        await store.set(blobKey, pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer, {
          metadata: {
            cachedAt: Date.now(),
            status: docStatus,
            type,
            booksDocId,
          }
        })
        console.log(`PDF stored to blob cache: ${blobKey} (${Math.round(pdfBuffer.length / 1024)}KB, status: ${docStatus})`)
      } catch (blobErr) {
        // Non-fatal — we still return the PDF, just won't be cached
        console.warn("Failed to cache PDF to blob store:", (blobErr as any).message)
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Access-Control-Allow-Origin": "*",
      "X-PDF-Source": servedFromCache ? "cache" : "zoho-live",
    }

    const docLabel = type === 'SalesOrder' ? 'SalesOrder' : type === 'Quote' ? 'Quote' : 'Invoice'
    if (download === "true") {
      headers["Content-Disposition"] = `attachment; filename="${docLabel}_${booksDocId}.pdf"`
    } else {
      headers["Content-Disposition"] = `inline; filename=${docLabel.toLowerCase()}.pdf`
    }

    return {
      statusCode: 200,
      headers,
      body: pdfBuffer!.toString("base64"),
      isBase64Encoded: true
    }

  } catch (error: any) {
    console.error("PDF Handler Error:", error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
