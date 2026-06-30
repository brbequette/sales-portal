import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

export const handler: Handler = async (event, context) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    }
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { id, type = "Invoice", booksInvoiceId: queryBooksId, download } = event.queryStringParameters || {}

    let booksDocId = queryBooksId || id

    // If direct books ID not provided, look up by DB id / zohoId
    let dbDoc = null
    if (!queryBooksId && id) {
      if (type === "Invoice") {
        dbDoc = await prisma.invoice.findFirst({ where: { OR: [{ id: id }, { zohoId: id }] } })
      } else if (type === "SalesOrder") {
        dbDoc = await prisma.salesOrder.findFirst({ where: { OR: [{ id: id }, { zohoId: id }] } })
      } else if (type === "Quote") {
        dbDoc = await prisma.quote.findFirst({ where: { OR: [{ id: id }, { zohoId: id }] } })
      }

      if (dbDoc) {
        const items = dbDoc.items as any
        if (items?.booksInvoiceId) {
          booksDocId = items.booksInvoiceId
        } else if (items?.booksSalesOrderId) {
          booksDocId = items.booksSalesOrderId
        } else if (items?.booksEstimateId) {
          booksDocId = items.booksEstimateId
        } else if (items?.invoiceNumber && type === "Invoice") {
          let searchInvNumber = items.invoiceNumber;
          if (typeof searchInvNumber === 'string' && searchInvNumber.includes('|')) {
            searchInvNumber = searchInvNumber.split('|').pop()?.trim();
          } else if (typeof searchInvNumber === 'string' && searchInvNumber.startsWith('INV-')) {
            searchInvNumber = searchInvNumber.substring(4).trim();
          }

          console.log(`Missing Books ID. Searching Zoho Books for invoice_number: ${searchInvNumber}...`)
          try {
            const token = await getZohoAccessToken()
            const searchUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&invoice_number=${searchInvNumber}`
            const searchRes = await fetch(searchUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
            if (searchRes.ok) {
              const searchData: any = await searchRes.json()
              if (searchData.invoices && searchData.invoices.length > 0) {
                booksDocId = searchData.invoices[0].invoice_id
                console.log(`Found Books ID ${booksDocId} via search. Saving to DB.`)
                // Save it back to prevent future searches
                items.booksInvoiceId = booksDocId
                await prisma.invoice.update({ where: { id: dbDoc.id }, data: { items } })
              }
            }
          } catch (e) {
            console.error("Failed to search Books API by invoice_number", e)
          }
        }
        
        // CRM ID fallback: try searching Books API by invoice number before using CRM ID
        if (!booksDocId && dbDoc.zohoId) {
          const items = dbDoc.items as any
          const invoiceNumber = items?.invoiceNumber || items?.salesOrderNumber || items?.quoteNumber
          if (invoiceNumber) {
            let searchNumber = typeof invoiceNumber === 'string' && invoiceNumber.includes('|') 
              ? invoiceNumber.split('|').pop()?.trim() 
              : (typeof invoiceNumber === 'string' && invoiceNumber.startsWith('INV-') 
                ? invoiceNumber.substring(4).trim() 
                : invoiceNumber)
            try {
              const token = await getZohoAccessToken()
              let searchModule = 'invoices'
              let searchParam = 'invoice_number'
              if (type === 'SalesOrder') { searchModule = 'salesorders'; searchParam = 'salesorder_number' }
              if (type === 'Quote') { searchModule = 'estimates'; searchParam = 'estimate_number' }
              const searchUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/${searchModule}?organization_id=${ORG_ID}&${searchParam}=${searchNumber}`
              const searchRes = await fetch(searchUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
              if (searchRes.ok) {
                const searchData: any = await searchRes.json()
                const results = searchData[searchModule]
                if (results && results.length > 0) {
                  const idField = type === 'SalesOrder' ? 'salesorder_id' : type === 'Quote' ? 'estimate_id' : 'invoice_id'
                  booksDocId = results[0][idField]
                  console.log(`Found Books ID ${booksDocId} via CRM fallback search.`)
                }
              }
            } catch (e) {
              console.error('Failed CRM fallback search by document number', e)
            }
          }

          // If we still only have the CRM ID, return a clear error rather than making a doomed Books API call
          if (!booksDocId) {
            return {
              statusCode: 404,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              } as Record<string, string>,
              body: JSON.stringify({ success: false, message: `Could not find a Zoho Books document ID for this ${type}. The record only has a CRM ID (${dbDoc.zohoId}) which cannot be used to fetch a PDF from Zoho Books.` })
            }
          }
        }
      }
    }

    if (!booksDocId) {
      return {
        statusCode: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } as Record<string, string>,
        body: JSON.stringify({ success: false, message: `Missing valid document ID for ${type}` })
      }
    }

    console.log(`Fetching PDF for Zoho Books ${type} ID: ${booksDocId}...`);
    const token = await getZohoAccessToken();
    
    // Determine the path based on doc type
    let modulePath = "invoices"
    if (type === "SalesOrder") modulePath = "salesorders"
    else if (type === "Quote") modulePath = "estimates"

    const pdfUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/${modulePath}/${booksDocId}?organization_id=${ORG_ID}&accept=pdf`;
    
    const pdfRes = await fetch(pdfUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      console.error(`Zoho Books PDF API failed with status ${pdfRes.status}: ${errText}`);
      return {
        statusCode: pdfRes.status,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } as Record<string, string>,
        body: JSON.stringify({ success: false, message: "Failed to download PDF from Zoho Books", detail: errText })
      }
    }

    const arrayBuffer = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Access-Control-Allow-Origin": "*",
    }

    if (download === "true") {
      headers["Content-Disposition"] = `attachment; filename="${type}_${booksDocId}.pdf"`;
    } else {
      headers["Content-Disposition"] = `inline; filename=${type.toLowerCase()}.pdf`;
    }

    return {
      statusCode: 200,
      headers: headers,
      body: buffer.toString("base64"),
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
