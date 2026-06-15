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
    const { id, invoiceId, targetId: paramTargetId } = event.queryStringParameters || {}
    let targetId = invoiceId || id || paramTargetId

    if (!targetId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: "Missing invoice identifier (id, invoiceId, or targetId)" })
      }
    }

    let booksInvoiceId = targetId

    // Try to check if targetId is an internal ID or zohoId and lookup booksInvoiceId
    const dbInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id: targetId },
          { zohoId: targetId }
        ]
      }
    })

    if (dbInvoice) {
      const items = dbInvoice.items as any
      if (items?.booksInvoiceId) {
        booksInvoiceId = items.booksInvoiceId
      }
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    const zohoRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
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

    // Save custom fields and update status/balance to local DB to keep database in sync
    if (dbInvoice) {
      const zohoInvoice = zohoData.invoice
      let status = dbInvoice.status
      if (zohoInvoice.status === 'paid' || zohoInvoice.balance === 0) {
        status = 'Paid'
      } else if (zohoInvoice.status === 'void') {
        status = 'Void'
      } else if (zohoInvoice.status === 'overdue' || (dbInvoice.dueDate && new Date(dbInvoice.dueDate) < new Date())) {
        status = 'Overdue'
      } else {
        status = zohoInvoice.status.charAt(0).toUpperCase() + zohoInvoice.status.slice(1)
      }

      const currentItems = (dbInvoice.items as any) || {}
      currentItems.custom_fields = zohoInvoice.custom_fields
      currentItems.balance = zohoInvoice.balance
      if (zohoInvoice.last_payment_date) {
        currentItems.paymentDate = zohoInvoice.last_payment_date
      }
      // Always write the authoritative salesperson from Zoho Books back to the DB
      // This self-corrects stale salesperson data (e.g. wrong name from old CRM sync)
      if (zohoInvoice.salesperson_name) {
        currentItems.salesperson = zohoInvoice.salesperson_name.toUpperCase().trim()
      }

      try {
        await prisma.invoice.update({
          where: { id: dbInvoice.id },
          data: {
            status: status,
            amount: parseFloat(zohoInvoice.sub_total || dbInvoice.amount),
            items: currentItems
          }
        })
      } catch (dbErr) {
        console.error("Failed to sync invoice status to DB:", dbErr)
      }
    }

    let vigRate = 1.5; // Default

    const salespersonName = zohoData.invoice.salesperson_name;
    if (salespersonName) {
      const isMontgomery = salespersonName.toLowerCase().includes('montgomery') || salespersonName.toLowerCase().includes('morgan');
      if (isMontgomery) {
        vigRate = 1.0;
      } else {
        // Find user by name
        const users = await prisma.user.findMany();
        const user = users.find(u => salespersonName.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(salespersonName.toLowerCase()));
        
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
      body: JSON.stringify({ success: true, invoice: zohoData.invoice, vigRate })
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
