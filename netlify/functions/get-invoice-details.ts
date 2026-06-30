import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { id, invoiceId, targetId: paramTargetId, type = "Invoice" } = event.queryStringParameters || {}
    let targetId = invoiceId || id || paramTargetId

    if (!targetId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: "Missing document identifier" })
      }
    }

    let booksDocId = targetId

    // Try to check if targetId is an internal ID or zohoId
    let dbDoc = null
    if (type === "Invoice") {
      dbDoc = await prisma.invoice.findFirst({ where: { OR: [{ id: targetId }, { zohoId: targetId }] } })
    } else if (type === "SalesOrder") {
      dbDoc = await prisma.salesOrder.findFirst({ where: { OR: [{ id: targetId }, { zohoId: targetId }] } })
    } else if (type === "Quote") {
      dbDoc = await prisma.quote.findFirst({ where: { OR: [{ id: targetId }, { zohoId: targetId }] } })
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
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    let modulePath = "invoices"
    if (type === "SalesOrder") modulePath = "salesorders"
    if (type === "Quote") modulePath = "estimates"

    const zohoRes = await fetch(`${baseUrl}/${modulePath}/${booksDocId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!zohoRes.ok) {
      const errorText = await zohoRes.text()
      throw new Error(`Zoho API failed with status ${zohoRes.status}: ${errorText}`)
    }

    const zohoData: any = await zohoRes.json()
    if (zohoData.code !== 0) {
      throw new Error(`Zoho error: ${zohoData.message}`)
    }

    let returnedDoc = zohoData.invoice
    if (type === "SalesOrder") returnedDoc = zohoData.salesorder
    if (type === "Quote") returnedDoc = zohoData.estimate

    // Save custom fields and update status/balance to local DB to keep database in sync
    if (dbDoc) {
      const zohoDoc = returnedDoc
      let status = dbDoc.status
      const zStatus = (zohoDoc.status || '').toLowerCase()
      if (zStatus === 'paid' || zohoDoc.balance === 0 || zStatus === 'closed' || zStatus === 'invoiced') {
        status = 'Paid'
      } else if (zStatus === 'void' || zStatus === 'voided' || zStatus === 'declined') {
        status = 'Void'
      } else if (zStatus === 'writeoff' || zStatus === 'write_off' || zStatus === 'write off' || zStatus === 'bad debt') {
        status = 'Writeoff'
      } else if (zStatus === 'draft') {
        status = 'Draft'
      } else if (zStatus === 'overdue' || (('dueDate' in dbDoc) && (dbDoc as any).dueDate && new Date((dbDoc as any).dueDate) < new Date())) {
        status = 'Overdue'
      } else {
        status = zohoDoc.status.charAt(0).toUpperCase() + zohoDoc.status.slice(1)
      }

      const currentItems = (dbDoc.items as any) || {}
      currentItems.custom_fields = zohoDoc.custom_fields
      currentItems.balance = zohoDoc.balance
      if (zohoDoc.last_payment_date) {
        currentItems.paymentDate = zohoDoc.last_payment_date
      }
      // Always write the authoritative salesperson from Zoho Books back to the DB
      // This self-corrects stale salesperson data (e.g. wrong name from old CRM sync)
      if (zohoDoc.salesperson_name) {
        currentItems.salesperson = zohoDoc.salesperson_name.toUpperCase().trim()
      }

      try {
        if (type === "Invoice") {
          await prisma.invoice.update({
            where: { id: dbDoc.id },
            data: { status, items: currentItems }
          })
        } else if (type === "SalesOrder") {
          await prisma.salesOrder.update({
            where: { id: dbDoc.id },
            data: { status, items: currentItems }
          })
        } else if (type === "Quote") {
          await prisma.quote.update({
            where: { id: dbDoc.id },
            data: { status, items: currentItems }
          })
        }
      } catch (dbErr) {
        console.error("Failed to update local db with synced details", dbErr)
      }
    }

    let vigRate = 1.5; // Default

    const salespersonName = returnedDoc.salesperson_name;
    if (salespersonName) {
      const isMontgomery = salespersonName.toLowerCase().includes('montgomery') || salespersonName.toLowerCase().includes('morgan');
      if (isMontgomery) {
        vigRate = 1.0;
      } else {
        // Find user by name
        const users = await prisma.user.findMany();
        const user = users.find(u => u.name && (salespersonName.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(salespersonName.toLowerCase())));
        
        if (user) {
          const settings = await prisma.systemSetting.findUnique({ where: { key: 'vig_settings' } });
          const allVigSettings = settings ? JSON.parse(settings.value) : {};
          const userVig = allVigSettings[user.id];
          
          if (userVig) {
            if (userVig.constantVigEnabled && userVig.constantVigValue !== null) {
              vigRate = userVig.constantVigValue;
            } else {
              // Get current month
              const currentMonthKey = new Date().toISOString().substring(0, 7);
              const monthlyGoal = (userVig.monthlyVigGoals || []).find((g: any) => g.monthKey === currentMonthKey);
              if (monthlyGoal && monthlyGoal.manualVigRate !== null) {
                vigRate = monthlyGoal.manualVigRate;
              }
            }
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, invoice: returnedDoc, salesorder: type === "SalesOrder" ? returnedDoc : undefined, estimate: type === "Quote" ? returnedDoc : undefined, vigRate })
    }
  } catch (err: any) {
    console.error("get-invoice-details error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
