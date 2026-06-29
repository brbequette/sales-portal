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
      // --- 60-minute sync cooldown ---
      const COOLDOWN_KEY = 'collections_last_synced_at'
      const COOLDOWN_MS = 60 * 60 * 1000 // 60 minutes
      const lastSync = await prisma.systemSetting.findUnique({ where: { key: COOLDOWN_KEY } })
      const cooldownActive = lastSync && (Date.now() - new Date(lastSync.value).getTime() < COOLDOWN_MS)

      if (cooldownActive) {
        console.log('Collections sync skipped — cooldown active (last sync:', lastSync!.value, ')')
      } else {
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
              }
            }

            // Force owner sync for all accounts with pending/unpaid/overdue invoices in DB
            const pendingInvoices = await prisma.invoice.findMany({
              where: {
                status: { notIn: ["Paid", "Void", "Draft"] }
              },
              select: {
                account: {
                  select: {
                    zohoId: true
                  }
                }
              }
            });
            const pendingAccountZohoIds = Array.from(
              new Set(pendingInvoices.map(inv => inv.account?.zohoId).filter(Boolean))
            );

            if (pendingAccountZohoIds.length > 0) {
              console.log(`Syncing current owners from CRM for ${pendingAccountZohoIds.length} accounts with pending invoices...`);
              for (let i = 0; i < pendingAccountZohoIds.length; i += 50) {
                const idChunk = pendingAccountZohoIds.slice(i, i + 50);
                const fetchRes = await fetch(
                  `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?ids=${idChunk.join(",")}`,
                  { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                );
                if (fetchRes.ok) {
                  const fetchData = await fetchRes.json();
                  const updatedRecords = fetchData.data || [];
                  for (const record of updatedRecords) {
                    const newOwnerZohoId = record.Owner?.id;
                    const newOwnerName = record.Owner?.name;
                    if (newOwnerZohoId) {
                      let dbNewOwner = await prisma.user.findUnique({ where: { zohoId: newOwnerZohoId } });
                      if (!dbNewOwner) {
                        dbNewOwner = await prisma.user.create({
                          data: {
                            zohoId: newOwnerZohoId,
                            name: newOwnerName || "Unknown Owner",
                            email: `${newOwnerZohoId}@dummy.titandiamond.com`,
                            role: "Sales Representative"
                          }
                        });
                      }

                      const tagsStr = Array.isArray(record.Tag)
                        ? record.Tag.map((t: any) => t.name).filter(Boolean).join(", ")
                        : null;
                      
                      let status = "Open";
                      const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null;
                      if (lastPurchaseDate) {
                        const twelveMonthsAgo = new Date();
                        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
                        status = lastPurchaseDate < twelveMonthsAgo ? "Update Status" : "Personal";
                      }

                      await prisma.account.update({
                        where: { zohoId: record.id },
                        data: {
                          ownerId: dbNewOwner.id,
                          name: record.Account_Name || record.name || "Unnamed Account",
                          industry: record.Industry || "Unknown",
                          tags: tagsStr,
                          status: status,
                          lastPurchaseAt: lastPurchaseDate
                        }
                      });
                      console.log(`Sync collections: updated account ${record.Account_Name} owner to ${newOwnerName}`);
                    }
                  }
                }
              }
            }

            // Cache map of account IDs for newly fetched accounts
            const localAccounts = await prisma.account.findMany({
              select: { id: true, zohoId: true }
            })
            const accountMap = new Map(localAccounts.map(a => [a.zohoId, a.id]))

            // Sync Invoices
            try {
              let invoicePage = 1
              let hasMoreInvoices = true
              let syncedInvoicesCount = 0
              const MAX_INVOICE_PAGES = 5

              const criteria = "((((Status:equals:Sent)or(Status:equals:Overdue))or(Status:equals:Partially Paid))or(Status:equals:Partial Paid))"

              while (hasMoreInvoices && invoicePage <= MAX_INVOICE_PAGES) {
                const invoiceRes = await fetch(
                  `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=${encodeURIComponent(criteria)}&page=${invoicePage}`,
                  { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                )

                if (!invoiceRes.ok) {
                  console.warn(`Zoho CustomModule5001 search failed with status ${invoiceRes.status}`);
                  break
                }

                const invoiceData = await invoiceRes.json()
                const zohoInvoices = (invoiceData as any).data || []
                if (zohoInvoices.length === 0) break

                // Identify missing accounts and fetch/upsert them
                const accountIdsToFetch = Array.from(new Set(zohoInvoices.map((inv: any) => inv.Account_Name?.id).filter(Boolean))) as string[]
                const missingAccountIds = accountIdsToFetch.filter(id => !accountMap.has(id))

                if (missingAccountIds.length > 0) {
                  console.log(`Sync collections: fetching ${missingAccountIds.length} missing accounts...`);
                  for (let i = 0; i < missingAccountIds.length; i += 50) {
                    const idChunk = missingAccountIds.slice(i, i + 50)
                    const accountsRes = await fetch(
                      `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?ids=${idChunk.join(",")}`,
                      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                    )
                    if (accountsRes.ok) {
                      const accountsData = await accountsRes.json()
                      const accountsRecords = accountsData.data || []
                      for (const record of accountsRecords) {
                        const ownerZohoId = record.Owner?.id
                        const ownerName = record.Owner?.name
                        let ownerDbId = null
                        if (ownerZohoId) {
                          let dbOwner = await prisma.user.findUnique({ where: { zohoId: ownerZohoId } })
                          if (!dbOwner) {
                            dbOwner = await prisma.user.create({
                              data: {
                                zohoId: ownerZohoId,
                                name: ownerName || "Unknown Owner",
                                email: `${ownerZohoId}@dummy.titandiamond.com`,
                                role: "Sales Representative"
                              }
                            })
                          }
                          ownerDbId = dbOwner.id
                        }

                        if (!ownerDbId) {
                          const fallback = await prisma.user.findFirst()
                          if (fallback) ownerDbId = fallback.id
                          else throw new Error("No users found")
                        }

                        const tagsStr = Array.isArray(record.Tag)
                          ? record.Tag.map((t: any) => t.name).filter(Boolean).join(", ")
                          : null

                        let status = "Open"
                        const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null
                        if (lastPurchaseDate) {
                          const twelveMonthsAgo = new Date()
                          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
                          status = lastPurchaseDate < twelveMonthsAgo ? "Update Status" : "Personal"
                        }

                        const upsertedAccount = await prisma.account.upsert({
                          where: { zohoId: record.id },
                          update: {
                            name: record.Account_Name || record.name || "Unnamed Account",
                            industry: record.Industry || "Unknown",
                            tags: tagsStr,
                            status: status,
                            lastPurchaseAt: lastPurchaseDate,
                            ownerId: ownerDbId || undefined
                          },
                          create: {
                            zohoId: record.id,
                            name: record.Account_Name || record.name || "Unnamed Account",
                            industry: record.Industry || "Unknown",
                            tags: tagsStr,
                            status: status,
                            lastPurchaseAt: lastPurchaseDate,
                            ownerId: ownerDbId as string
                          }
                        })
                        accountMap.set(record.id, upsertedAccount.id)
                      }
                    }
                  }
                }

                const invoiceOps = []
                for (const invRecord of zohoInvoices) {
                  const accountZohoId = invRecord.Account_Name?.id
                  const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null

                  let status = invRecord.Status || "Paid"
                  if (status === "Closed") status = "Paid"
                  const dueDate = invRecord.Due_Date ? new Date(invRecord.Due_Date) : null
                  const NON_OVERDUE = new Set(["Paid", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"])
                  if (!NON_OVERDUE.has(status) && dueDate && dueDate < new Date()) {
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
                            commission: parseFloat(invRecord.cf_commission_amount_unformatted || invRecord.Commission_Amount || invRecord.Commission || 0),
                            paymentDate: invRecord.Paid_In_Full_Date,
                            salesperson: invRecord.Sales_Person || null
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
                            commission: parseFloat(invRecord.cf_commission_amount_unformatted || invRecord.Commission_Amount || invRecord.Commission || 0),
                            paymentDate: invRecord.Paid_In_Full_Date,
                            salesperson: invRecord.Sales_Person || null
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
              console.log(`Synced ${syncedInvoicesCount} invoices globally from collections page.`)
              
              // Fetch the latest payment/status updates directly from Zoho Books to bypass CRM sync delay
              await syncRecentBooksInvoices()
            } catch (invError) {
              console.error("Failed to sync invoices in collections:", invError)
            }

            // Record successful sync timestamp for cooldown
            await prisma.systemSetting.upsert({
              where: { key: COOLDOWN_KEY },
              update: { value: new Date().toISOString() },
              create: { key: COOLDOWN_KEY, value: new Date().toISOString() }
            })
          } catch (zohoError) {
            console.error("Failed to sync with live Zoho CRM from collections page:", zohoError)
          }
        }
      } // end cooldown else
    }

    let invoices: any[]

    if (tab === "all") {
      // All Outstanding: unpaid status
      invoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ["Paid", "Closed", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "closed", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"] }
        },
        include: {
          account: {
            include: { owner: true }
          }
        },
        orderBy: { dueDate: "asc" },
      })
    } else if (tab === "overdue") {
      // Overdue: status contains "Overdue" OR (not Paid and past due date)
      invoices = await prisma.invoice.findMany({
        where: {
          AND: [
            { status: { notIn: ["Paid", "Closed", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "closed", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"] } },
            {
              OR: [
                // Explicit Overdue status
                { status: { contains: "Overdue", mode: "insensitive" } },
                // Past due with unpaid status
                {
                  dueDate: { lt: now },
                },
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
    } else {
      // Current: unpaid and not overdue
      invoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ["Paid", "Closed", "Void", "Voided", "Draft", "Writeoff", "Write_off", "Write Off", "Bad Debt", "paid", "closed", "void", "voided", "draft", "writeoff", "write_off", "write off", "bad debt"] },
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
      const salespersonVal = items?.salesperson || inv.account?.owner?.name || "Unassigned"
      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoice_id: inv.zohoId,
        invoice_number: items?.invoiceNumber || items?.invoice_number || inv.zohoId?.slice(-6) || "—",
        customer_name: inv.account?.name || "Unknown",
        customer_id: inv.account?.zohoId || inv.accountId,
        salesperson_name: salespersonVal,
        salesperson_id: inv.account?.owner?.id,
        salesperson_zoho_id: inv.account?.owner?.zohoId || null,
        salesperson_email: inv.account?.owner?.email || null,
        account_owner_name: inv.account?.owner?.name || "Unassigned",
        account_owner_id: inv.account?.owner?.id || null,
        account_owner_zoho_id: inv.account?.owner?.zohoId || null,
        account_owner_email: inv.account?.owner?.email || null,
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
