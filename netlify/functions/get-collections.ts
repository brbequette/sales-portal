import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { syncRecentBooksInvoices } from "./lib/zoho-books"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { tab = "overdue", repId, refresh, zohoId, email } = event.queryStringParameters || {}
    const now = new Date()

    if (refresh === "true" && (zohoId || email)) {
      let user = null
      if (zohoId) {
        user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
      }
      if (!user && email) {
        user = await prisma.user.findUnique({ where: { email: email } })
      }

      if (user && user.zohoId && !user.zohoId.startsWith("mock-zoho")) {
        try {
          const token = await getZohoAccessToken()
          const ZOHO_DC = process.env.ZOHO_DC || "com"
          const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`

          console.log(`Syncing Zoho for user ${user.email} from collections page...`)

          // Search Zoho CRM for Accounts assigned to this user
          const searchRes = await fetch(`${baseUrl}/search?criteria=(Owner.id:equals:${user.zohoId})`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          })

          if (searchRes.ok) {
            const searchData = await searchRes.json()
            const zohoAccounts = searchData.data || []

            if (zohoAccounts.length > 0) {
              const accountOps = zohoAccounts.map((record: any) => {
                let status = "Open"
                const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null
                if (lastPurchaseDate) {
                  const twelveMonthsAgo = new Date()
                  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
                  status = lastPurchaseDate < twelveMonthsAgo ? "Update Status" : "Personal"
                }
                const tagsStr = Array.isArray(record.Tag)
                  ? record.Tag.map((t: any) => t.name).filter(Boolean).join(", ")
                  : null

                return prisma.account.upsert({
                  where: { zohoId: record.id },
                  update: {
                    name: record.Account_Name || record.name || "Unnamed Account",
                    industry: record.Industry || "Unknown",
                    tags: tagsStr,
                    status: status,
                    lastPurchaseAt: lastPurchaseDate,
                    ownerId: user.id,
                  },
                  create: {
                    zohoId: record.id,
                    name: record.Account_Name || record.name || "Unnamed Account",
                    industry: record.Industry || "Unknown",
                    tags: tagsStr,
                    status: status,
                    lastPurchaseAt: lastPurchaseDate,
                    ownerId: user.id,
                  }
                })
              })

              for (let i = 0; i < accountOps.length; i += 50) {
                const chunk = accountOps.slice(i, i + 50)
                await prisma.$transaction(chunk)
              }

              // Reassignment check: find local accounts previously owned by this user but not returned by Zoho in this sync
              const zohoZohoIds = new Set(zohoAccounts.map((r: any) => r.id));
              const localAccountsBeforeReassign = await prisma.account.findMany({
                where: { ownerId: user.id },
                select: { id: true, zohoId: true }
              });
              
              const missingAccountZohoIds = localAccountsBeforeReassign
                .map(a => a.zohoId)
                .filter(zid => !zohoZohoIds.has(zid));

              if (missingAccountZohoIds.length > 0) {
                console.log(`Detected ${missingAccountZohoIds.length} accounts locally owned by ${user.email} that are no longer returned by Zoho. Syncing their current owners...`);
                try {
                  for (let j = 0; j < missingAccountZohoIds.length; j += 50) {
                    const idChunk = missingAccountZohoIds.slice(j, j + 50);
                    const fetchRes = await fetch(
                      `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?ids=${idChunk.join(",")}`,
                      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                    );
                    if (fetchRes.ok) {
                      const fetchData = await fetchRes.json();
                      const updatedRecords = fetchData.data || [];
                      for (const record of updatedRecords) {
                        const newOwnerZohoId = record.Owner?.id;
                        if (newOwnerZohoId && newOwnerZohoId !== user.zohoId) {
                          let dbNewOwner = await prisma.user.findUnique({ where: { zohoId: newOwnerZohoId } });
                          if (!dbNewOwner) {
                            dbNewOwner = await prisma.user.create({
                              data: {
                                zohoId: newOwnerZohoId,
                                name: record.Owner.name || "Unknown Owner",
                                email: `${newOwnerZohoId}@dummy.titandiamond.com`,
                                role: "Sales Representative"
                              }
                            });
                          }
                          await prisma.account.update({
                            where: { zohoId: record.id },
                            data: { ownerId: dbNewOwner.id }
                          });
                          console.log(`Reassigned account ${record.Account_Name} (Zoho ID: ${record.id}) to new owner ${record.Owner.name}`);
                        }
                      }
                    }
                  }
                } catch (reassignErr) {
                  console.error("Failed to process reassigned accounts:", reassignErr);
                }
              }

              // Cache map of account IDs
              const localAccounts = await prisma.account.findMany({
                where: { ownerId: user.id },
                select: { id: true, zohoId: true }
              })
              const accountMap = new Map(localAccounts.map(a => [a.zohoId, a.id]))

              // Sync Invoices
              try {
                let invoicePage = 1
                let hasMoreInvoices = true
                let syncedInvoicesCount = 0
                const MAX_INVOICE_PAGES = 5

                while (hasMoreInvoices && invoicePage <= MAX_INVOICE_PAGES) {
                  const invoiceRes = await fetch(
                    `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Owner.id:equals:${user.zohoId})&page=${invoicePage}`,
                    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                  )

                  if (!invoiceRes.ok) break

                  const invoiceData = await invoiceRes.json()
                  const zohoInvoices = (invoiceData as any).data || []
                  if (zohoInvoices.length === 0) break

                  const invoiceOps = []
                  for (const invRecord of zohoInvoices) {
                    const accountZohoId = invRecord.Account_Name?.id
                    const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null

                    let status = invRecord.Status || "Paid"
                    const dueDate = invRecord.Due_Date ? new Date(invRecord.Due_Date) : null
                    if (status !== "Paid" && status !== "Void" && dueDate && dueDate < new Date()) {
                      status = "Overdue"
                    }

                    if (dbAccountId) {
                      invoiceOps.push(
                        prisma.invoice.upsert({
                          where: { zohoId: invRecord.id },
                          update: {
                            amount: parseFloat(invRecord.Sub_Total || 0),
                            status: status,
                            issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
                            dueDate: dueDate,
                            items: {
                              booksInvoiceId: invRecord.Invoice_ID,
                              invoiceNumber: invRecord.Name,
                              balance: invRecord.Balance || 0,
                              profit: parseFloat(invRecord.Profit || 0),
                              deadCostTotal: parseFloat(invRecord.Dead_Cost_Total || 0),
                              paymentDate: invRecord.Paid_In_Full_Date
                            }
                          },
                          create: {
                            zohoId: invRecord.id,
                            accountId: dbAccountId,
                            amount: parseFloat(invRecord.Sub_Total || 0),
                            status: status,
                            issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
                            dueDate: dueDate,
                            items: {
                              booksInvoiceId: invRecord.Invoice_ID,
                              invoiceNumber: invRecord.Name,
                              balance: invRecord.Balance || 0,
                              profit: parseFloat(invRecord.Profit || 0),
                              deadCostTotal: parseFloat(invRecord.Dead_Cost_Total || 0),
                              paymentDate: invRecord.Paid_In_Full_Date
                            }
                          }
                        })
                      )
                    }
                  }

                  for (let i = 0; i < invoiceOps.length; i += 50) {
                    const chunk = invoiceOps.slice(i, i + 50)
                    await prisma.$transaction(chunk)
                    syncedInvoicesCount += chunk.length
                  }

                  hasMoreInvoices = (invoiceData as any).info?.more_records || false
                  invoicePage++
                }
                console.log(`Synced ${syncedInvoicesCount} invoices for owner ${user.zohoId} from collections page.`)
                
                // Fetch the latest payment/status updates directly from Zoho Books to bypass CRM sync delay
                await syncRecentBooksInvoices()
              } catch (invError) {
                console.error("Failed to sync invoices in collections:", invError)
              }
            }
          }
        } catch (zohoError) {
          console.error("Failed to sync with live Zoho CRM from collections page:", zohoError)
        }
      }
    }

    let invoices: any[]

    if (tab === "overdue") {
      // Overdue: status contains "Overdue" OR (not Paid and past due date)
      invoices = await prisma.invoice.findMany({
        where: {
          OR: [
            // Explicit Overdue status
            { status: { contains: "Overdue", mode: "insensitive" } },
            // Past due with unpaid status
            {
              dueDate: { lt: now },
              status: { notIn: ["Paid", "Void", "Draft"] }
            },
          ]
        },
        include: {
          account: {
            include: { owner: true }
          }
        },
        orderBy: { dueDate: "asc" },
      })
    } else {
      // Current: unpaid and not overdue
      invoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ["Paid", "Void", "Draft"] },
          AND: [
            {
              NOT: {
                status: { contains: "Overdue", mode: "insensitive" }
              }
            },
            {
              OR: [
                { dueDate: { gte: now } },
                { dueDate: null },
              ]
            }
          ]
        },
        include: {
          account: {
            include: { owner: true }
          }
        },
        orderBy: { dueDate: "asc" },
      })
    }

    // Filter by rep
    if (repId) {
      invoices = invoices.filter(inv => inv.account?.ownerId === repId)
    }

    const daysOverdue = (dueDate: Date | null) => {
      if (!dueDate) return 0
      return Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000))
    }

    const formatted = invoices.map(inv => {
      const items = inv.items as any
      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoice_id: inv.zohoId,
        invoice_number: items?.invoiceNumber || items?.invoice_number || inv.zohoId?.slice(-6) || "—",
        customer_name: inv.account?.name || "Unknown",
        customer_id: inv.account?.zohoId || inv.accountId,
        salesperson_name: inv.account?.owner?.name || "Unassigned",
        salesperson_id: inv.account?.owner?.id,
        salesperson_zoho_id: inv.account?.owner?.zohoId || null,
        salesperson_email: inv.account?.owner?.email || null,
        due_date: inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : null,
        issue_date: inv.issueDate ? inv.issueDate.toISOString().split("T")[0] : null,
        balance: inv.amount,
        total: inv.amount,
        status: inv.status,
        days_overdue: daysOverdue(inv.dueDate),
        books_invoice_id: items?.booksInvoiceId || null,
        profit: items?.profit || 0,
        dead_cost: items?.deadCostTotal || 0,
      }
    })

    const totalBalance = formatted.reduce((s, i) => s + (i.balance || 0), 0)
    const totalProfit = formatted.reduce((s, i) => s + (i.profit || 0), 0)
    const uniqueAccounts = new Set(formatted.map(i => i.customer_id)).size

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        invoices: formatted,
        count: formatted.length,
        totalBalance,
        totalProfit,
        uniqueAccounts,
        tab,
      }),
    }
  } catch (err: any) {
    console.error("get-collections error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message }),
    }
  }
}
