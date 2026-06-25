import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

export async function syncRecentBooksInvoices() {
  try {
    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    
    // Fetch 500 most recently modified invoices (5 pages of 100)
    let page = 1;
    let hasMore = true;
    let allBooksInvoices: any[] = [];
    
    while (hasMore && page <= 5) {
      const res = await fetch(`${baseUrl}/invoices?organization_id=${ORG_ID}&per_page=100&page=${page}&sort_column=last_modified_time&sort_order=D`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const data = await res.json()
      
      if (data.code === 0 && data.invoices) {
        allBooksInvoices = [...allBooksInvoices, ...data.invoices];
        hasMore = data.page_context?.has_more_page || false;
        page++;
      } else {
        hasMore = false;
      }
    }
    
    if (allBooksInvoices.length > 0) {
      console.log(`Fetched ${allBooksInvoices.length} recent invoices from Zoho Books to sync status.`)
      const updateOps = []

      // --- Bulk fetch: single query replaces N findFirst calls ---
      const booksInvoices = allBooksInvoices
      const allBookIds = booksInvoices.map((inv: any) => inv.invoice_id).filter(Boolean)
      const allInvNumbers = booksInvoices.map((inv: any) => inv.invoice_number).filter(Boolean)

      const matchingInvoices = await prisma.invoice.findMany({
        where: {
          OR: [
            ...(allBookIds.length > 0
              ? allBookIds.map((bid: string) => ({
                  items: { path: ['booksInvoiceId'], equals: bid }
                }))
              : []),
            ...(allInvNumbers.length > 0
              ? allInvNumbers.map((num: string) => ({
                  items: { path: ['invoiceNumber'], equals: num }
                }))
              : [])
          ]
        }
      })

      // Build O(1) lookup maps
      const byBooksId = new Map<string, typeof matchingInvoices[0]>()
      const byInvNumber = new Map<string, typeof matchingInvoices[0]>()
      for (const inv of matchingInvoices) {
        const items = inv.items as any
        if (items?.booksInvoiceId) byBooksId.set(items.booksInvoiceId, inv)
        if (items?.invoiceNumber) byInvNumber.set(items.invoiceNumber, inv)
      }

      for (const booksInv of booksInvoices) {
        // O(1) map lookup instead of DB query
        const localInvoice =
          byBooksId.get(booksInv.invoice_id) ||
          byInvNumber.get(booksInv.invoice_number) ||
          null
        
        if (localInvoice) {
          let status = localInvoice.status
          if (booksInv.status === 'paid' || booksInv.balance === 0) {
            status = 'Paid'
          } else if (booksInv.status === 'void') {
            status = 'Void'
          } else if (booksInv.status === 'overdue' || (localInvoice.dueDate && new Date(localInvoice.dueDate) < new Date())) {
            status = 'Overdue'
          } else {
            status = booksInv.status.charAt(0).toUpperCase() + booksInv.status.slice(1)
          }
          
          const currentItems = (localInvoice.items as any) || {}
          currentItems.balance = booksInv.balance
          if (booksInv.last_payment_date) {
            currentItems.paymentDate = booksInv.last_payment_date
          }
          
          const newTotal = parseFloat(booksInv.sub_total || booksInv.total || localInvoice.amount)
          const deadCost = parseFloat(currentItems.deadCostTotal || 0)
          currentItems.profit = Math.max(0, newTotal - deadCost)
          
          updateOps.push(
            prisma.invoice.update({
              where: { id: localInvoice.id },
              data: {
                status: status,
                amount: newTotal,
                items: currentItems
              }
            })
          )
        }
      }
      
      if (updateOps.length > 0) {
        // Run updates sequentially or in transaction to prevent deadlock/concurrency issues
        await prisma.$transaction(updateOps)
        console.log(`Successfully updated ${updateOps.length} matching invoices from Books.`)
      }
    } else {
      console.warn("No recently modified invoices found in Books.")
    }
  } catch (err) {
    console.error("Failed to sync recent Books invoices:", err)
  }
}
