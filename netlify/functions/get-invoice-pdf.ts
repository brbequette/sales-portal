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

    let booksDocId = queryBooksId

    // If direct books ID not provided, look up by DB id / zohoId
    if (!booksDocId && id) {
      if (type === "Invoice") {
        let dbInvoice = await prisma.invoice.findUnique({ where: { zohoId: id } })
        if (!dbInvoice) dbInvoice = await prisma.invoice.findUnique({ where: { id: id } })
        if (dbInvoice) {
          const metadata = dbInvoice.items as any
          booksDocId = metadata?.booksInvoiceId
        }
      } else if (type === "SalesOrder") {
        let dbSO = await prisma.salesOrder.findFirst({
          where: { OR: [{ id: id }, { zohoId: id }] }
        })
        if (dbSO) {
          booksDocId = dbSO.zohoId || undefined
        }
      } else if (type === "Quote") {
        let dbQuote = await prisma.quote.findFirst({
          where: { OR: [{ id: id }, { zohoId: id }] }
        })
        if (dbQuote) {
          booksDocId = dbQuote.zohoId || undefined
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
