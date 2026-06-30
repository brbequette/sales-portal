import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { syncRecentBooksInvoices } from "./lib/zoho-books"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';


export const handler: Handler = async (event, context) => {
  // Allow GET requests
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const { zohoId, email, refresh, force, ownerIdFilter, statusFilter, role: passedRole, page: pageParam, search, includeDocs, includeHidden } = event.queryStringParameters || {}
    const wantDocs = includeDocs === 'true'
    const showHidden = includeHidden === 'true'
    const PAGE_SIZE = 400
    const page = parseInt(pageParam || '1', 10)

    if (!zohoId && !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing zohoId or email parameter" })
      }
    }

    let user = null

    // 1. Try to find the user by their Zoho CRM User ID or Prisma CUID
    if (zohoId) {
      if (zohoId.startsWith('c') && zohoId.length >= 20) {
        user = await prisma.user.findUnique({ where: { id: zohoId } })
      } else {
        user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
      }
    }

    // 2. Fall back to finding them by email
    if (!user && email) {
      user = await prisma.user.findUnique({ where: { email: email } })
    }

    if (!user) {
      console.log(`User not found in local DB. ZohoId: ${zohoId}, Email: ${email}. Auto-creating...`)
      user = await prisma.user.create({
        data: {
          email: email || `${zohoId}@titandiamond.net`,
          zohoId: zohoId || `mock-zoho-${Date.now()}`,
          name: email ? email.split('@')[0] : 'Demo User',
          role: passedRole || 'Sales Representative'
        }
      })
    }

    // Auto-heal Ben and Monty's roles/names in the database
    const lowerEmail = user.email?.toLowerCase() || "";
    let needsUpdate = false;
    let updateData: any = {};

    if ((
      lowerEmail.includes("ben") || 
      lowerEmail.includes("monty") || 
      lowerEmail.includes("bequette") || 
      lowerEmail.includes("morgan")
    ) && user.role !== "Administrator") {
      updateData.role = "Administrator";
      needsUpdate = true;
    }

    if (lowerEmail === "ben@titandiamond.net" && user.name !== "Benjamin Bequette") {
      updateData.name = "Benjamin Bequette";
      needsUpdate = true;
    }

    if (needsUpdate) {
      console.log(`Auto-healing role/name for ${user.email}...`);
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
    }

    const normalizedRole = user.role?.toLowerCase() || "";
    // Only restrict visibility if the user's role explicitly contains "sales" but NOT "admin", "manager", or "collections"
    const isSalesOnly = normalizedRole.includes("sales") && 
                        !normalizedRole.includes("admin") && 
                        !normalizedRole.includes("administrator") && 
                        !normalizedRole.includes("manager") && 
                        !normalizedRole.includes("collections");
    const isAdmin = !isSalesOnly;

    // 3. Only sync LIVE accounts from Zoho CRM if explicitly requested via refresh=true.
    let shouldSync = false
    if (refresh === 'true') {
      const lastUpdatedAccount = await prisma.account.findFirst({
        where: isSalesOnly ? { ownerId: user.id } : {},
        orderBy: { updatedAt: 'desc' }
      })

      // Hard minimum: never sync more than once per 60 minutes even if refresh is requested unless force=true
      const syncCooldownMs = 60 * 60 * 1000 // 60 minutes
      const hasRecentSync = lastUpdatedAccount && (Date.now() - new Date(lastUpdatedAccount.updatedAt).getTime() < syncCooldownMs)

      if (!hasRecentSync || force === 'true') {
        shouldSync = true
      } else {
        console.log(`Skipping Zoho sync — synced within the last hour. (Pass force=true to bypass cooldown)`)
      }
    }

    if (shouldSync) {
      try {
        const token = await getZohoAccessToken();
        
        let usersToSync = [user]
        if (isAdmin) {
          try {
            console.log("Fetching active users from Zoho CRM...")
            const usersRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/users?type=ActiveUsers`, {
              headers: { Authorization: `Zoho-oauthtoken ${token}` },
            })
            if (usersRes.ok) {
              const usersData = await usersRes.json()
              const zohoUsers = usersData.users || []
              console.log(`Found ${zohoUsers.length} active users in Zoho CRM. Syncing them...`)
              for (const zUser of zohoUsers) {
                if (!zUser.id || !zUser.email) continue;
                const roleName = zUser.profile?.name || "Sales Representative"
                await prisma.user.upsert({
                  where: { zohoId: zUser.id },
                  update: {
                    name: zUser.full_name || zUser.name,
                    email: zUser.email,
                    role: roleName,
                  },
                  create: {
                    zohoId: zUser.id,
                    name: zUser.full_name || zUser.name,
                    email: zUser.email,
                    role: roleName,
                  }
                })
              }
            } else {
              console.warn(`Zoho CRM Users API failed with status ${usersRes.status}`)
            }
          } catch (usersErr) {
            console.error("Failed to sync users from Zoho CRM:", usersErr)
          }

          const dbUsers = await prisma.user.findMany()
          usersToSync = dbUsers.filter(u => u.zohoId && !u.zohoId.startsWith('mock-zoho') && !u.zohoId.startsWith('auto'))
        }

        const fullPull = event.queryStringParameters?.full === 'true' || event.queryStringParameters?.refresh === 'true';
        const baseUrlAccounts = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`;
        const baseUrlContacts = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts`;
        const baseUrlDeals = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Deals`;
        const baseUrlInvoices = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001`;
        const baseUrlNotes = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Notes`;

        let globalAccounts: any[] = [];
        let globalContacts: any[] = [];
        let globalDeals: any[] = [];
        let globalInvoices: any[] = [];
        let globalNotes: any[] = [];

        if (!fullPull) {
          console.log(`Performing fast global incremental pull for updated records...`)
          const headers = { Authorization: `Zoho-oauthtoken ${token}` };
          const fetchRecent = async (url: string) => {
            let results: any[] = [];
            try {
              for (let p = 1; p <= 3; p++) {
                const res = await fetch(`${url}?sort_by=Modified_Time&sort_order=desc&per_page=200&page=${p}`, { headers });
                if (!res.ok) break;
                const data = await res.json();
                if (data.data) results = [...results, ...data.data];
                if (!data.info || !data.info.more_records) break;
              }
            } catch (e) {
              console.error(`Failed to fetch recent from ${url}`, e);
            }
            return results;
          };

          [globalAccounts, globalContacts, globalDeals, globalInvoices, globalNotes] = await Promise.all([
            fetchRecent(baseUrlAccounts),
            fetchRecent(baseUrlContacts),
            fetchRecent(baseUrlDeals),
            fetchRecent(baseUrlInvoices),
            fetchRecent(baseUrlNotes)
          ]);
        }

        console.log(`Syncing Zoho CRM for ${usersToSync.length} representatives (Full Pull: ${fullPull})...`)

        for (const syncUser of usersToSync) {
          if (!syncUser.zohoId) continue;
          
          const baseUrl = baseUrlAccounts;
          
          // Search Zoho CRM for Accounts assigned to this user, paginating to get all of them
          let page = 1;
          let zohoAccounts: any[] = [];
          let hasMore = true;

          if (!fullPull) {
            zohoAccounts = globalAccounts.filter(a => a.Owner?.id === syncUser.zohoId);
            hasMore = false;
          }

          while (hasMore) {
            const searchRes = await fetch(`${baseUrl}/search?criteria=(Owner.id:equals:${syncUser.zohoId})&page=${page}&per_page=200`, {
              headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });

            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const pageRecords = searchData.data || [];
              zohoAccounts = [...zohoAccounts, ...pageRecords];
              
              if (searchData.info && searchData.info.more_records) {
                page++;
              } else {
                hasMore = false;
              }
            } else {
              hasMore = false;
            }
          }

          if (zohoAccounts.length > 0) {
            console.log(`Found ${zohoAccounts.length} live accounts from Zoho for user ${syncUser.email}`);
              
              // Deduplicate incoming Zoho accounts by name
              const localAccountsBefore = await prisma.account.findMany({
                where: { ownerId: syncUser.id },
                select: { id: true, zohoId: true, name: true, zohoModifiedTime: true }
              });
              const nameMap = new Map();
              const dbModifiedTimeMap = new Map();
              localAccountsBefore.forEach(a => {
                nameMap.set(a.name.toLowerCase().trim(), a.id);
                if (a.zohoId) dbModifiedTimeMap.set(a.zohoId, a.zohoModifiedTime ? new Date(a.zohoModifiedTime).getTime() : 0);
              });

              const uniqueZohoAccounts = [];
              const seenNames = new Set(nameMap.keys());

              for (const record of zohoAccounts) {
                const nameKey = (record.Account_Name || record.name || 'Unnamed Account').toLowerCase().trim();
                if (!seenNames.has(nameKey)) {
                  seenNames.add(nameKey);
                  uniqueZohoAccounts.push(record);
                }
              }

              // Upsert each unique account
              const accountOps = [];
              for (const record of uniqueZohoAccounts) {
                const incomingModifiedTimeStr = record.Modified_Time || record.Updated_Time;
                const incomingModifiedTime = incomingModifiedTimeStr ? new Date(incomingModifiedTimeStr).getTime() : 0;
                const dbModifiedTime = dbModifiedTimeMap.get(record.id) || 0;

                if (dbModifiedTime > 0 && incomingModifiedTime > 0 && dbModifiedTime >= incomingModifiedTime) {
                  continue;
                }
                
                let status = 'Open'
                const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null
                if (lastPurchaseDate) {
                  const twelveMonthsAgo = new Date()
                  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
                  status = lastPurchaseDate < twelveMonthsAgo ? 'Update Status' : 'Personal'
                }
                const tagsStr = Array.isArray(record.Tag)
                  ? record.Tag.map((t: any) => t.name).filter(Boolean).join(', ')
                  : null;
                
                let timeZone = record.Time_Zone || record.Timezone || record.timeZone || record.timezone || null;
                if (!timeZone && record.Billing_Code) {
                  const match = String(record.Billing_Code).match(/\d{5}/);
                  if (match) {
                    const prefix = parseInt(match[0].substring(0, 3), 10);
                    if (prefix >= 0 && prefix <= 349) timeZone = 'EST';
                    else if (prefix >= 430 && prefix <= 499) timeZone = 'EST';
                    else if (prefix >= 350 && prefix <= 427) timeZone = 'CST';
                    else if (prefix >= 500 && prefix <= 589) timeZone = 'CST';
                    else if (prefix >= 600 && prefix <= 689) timeZone = 'CST';
                    else if (prefix >= 700 && prefix <= 789) timeZone = 'CST';
                    else if (prefix >= 590 && prefix <= 599) timeZone = 'MST';
                    else if (prefix >= 690 && prefix <= 693) timeZone = 'MST';
                    else if (prefix >= 790 && prefix <= 799) timeZone = 'MST';
                    else if (prefix >= 800 && prefix <= 849) timeZone = 'MST';
                    else if (prefix >= 850 && prefix <= 884) timeZone = 'MST';
                    else if (prefix >= 889 && prefix <= 899) timeZone = 'PST';
                    else if (prefix >= 900 && prefix <= 961) timeZone = 'PST';
                    else if (prefix >= 970 && prefix <= 994) timeZone = 'PST';
                    else if (prefix >= 995 && prefix <= 999) timeZone = 'AST';
                    else if (prefix === 967 || prefix === 968) timeZone = 'HST';
                  }
                }
                const updateData: any = {
                  name: record.Account_Name || record.name || 'Unnamed Account',
                  industry: record.Industry || 'Unknown',
                  tags: tagsStr,
                  ownerId: syncUser.id,
                  timeZone: timeZone, billingStreet: record.Billing_Street || null, billingCity: record.Billing_City || null, billingState: record.Billing_State || null, billingZip: record.Billing_Code || null, shippingStreet: record.Shipping_Street || null, shippingCity: record.Shipping_City || null, shippingState: record.Shipping_State || null, shippingZip: record.Shipping_Code || null,
                  zohoModifiedTime: incomingModifiedTimeStr ? new Date(incomingModifiedTimeStr) : null,
                  rawData: record,
                }
                if (lastPurchaseDate) {
                  updateData.lastPurchaseAt = lastPurchaseDate
                  updateData.status = status
                }
                
                accountOps.push(prisma.account.upsert({
                  where: { zohoId: record.id },
                  update: updateData,
                  create: {
                    zohoId: record.id,
                    name: record.Account_Name || record.name || 'Unnamed Account',
                    industry: record.Industry || 'Unknown',
                    tags: tagsStr,
                    status: status,
                    lastPurchaseAt: lastPurchaseDate,
                    ownerId: syncUser.id,
                    timeZone: timeZone, billingStreet: record.Billing_Street || null, billingCity: record.Billing_City || null, billingState: record.Billing_State || null, billingZip: record.Billing_Code || null, shippingStreet: record.Shipping_Street || null, shippingCity: record.Shipping_City || null, shippingState: record.Shipping_State || null, shippingZip: record.Shipping_Code || null,
                    zohoModifiedTime: incomingModifiedTimeStr ? new Date(incomingModifiedTimeStr) : null,
                    rawData: record,
                  }
                }));
              }

              for (let i = 0; i < accountOps.length; i += 50) {
                const chunk = accountOps.slice(i, i + 50)
                await prisma.$transaction(chunk)
              }

              // Cache the newly synced account IDs in a local Map
              const localAccountsAfter = await prisma.account.findMany({
                where: { ownerId: syncUser.id },
                select: { id: true, zohoId: true, name: true }
              });
              const accountMap = new Map(localAccountsAfter.map(a => [a.zohoId, a.id]));
              
              const updatedNameMap = new Map();
              localAccountsAfter.forEach(a => updatedNameMap.set(a.name.toLowerCase().trim(), a.id));

              // Ensure duplicate Zoho IDs point to the kept canonical account ID
              for (const record of zohoAccounts) {
                const nameKey = (record.Account_Name || record.name || 'Unnamed Account').toLowerCase().trim();
                if (!accountMap.has(record.id)) {
                  const keptId = updatedNameMap.get(nameKey);
                  if (keptId) accountMap.set(record.id, keptId);
                }
              }

              // Reassignment check: find local accounts owned by this user but not returned by Zoho
              const zohoZohoIds = new Set(zohoAccounts.map((r: any) => r.id));
              const localAccountsBeforeReassign = localAccountsAfter;
              
              const missingAccountZohoIds = localAccountsBeforeReassign
                .map(a => a.zohoId)
                .filter(zid => !zohoZohoIds.has(zid));

              if (missingAccountZohoIds.length > 0) {
                console.log(`Detected ${missingAccountZohoIds.length} accounts locally owned by ${syncUser.email} that are no longer returned by Zoho. Syncing owners / cleaning deleted...`);
                const foundInZoho = new Set<string>();
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
                        foundInZoho.add(record.id);
                        const newOwnerZohoId = record.Owner?.id;
                        if (newOwnerZohoId && newOwnerZohoId !== syncUser.zohoId) {
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
                        }
                      }
                    }
                  }

                  // Cascade-delete accounts that Zoho confirmed are gone
                  const deletedZohoIds = missingAccountZohoIds.filter(zid => !foundInZoho.has(zid));
                  if (deletedZohoIds.length > 0) {
                    console.log(`Cascade-deleting ${deletedZohoIds.length} accounts removed from Zoho CRM...`);
                    const accountsToDelete = await prisma.account.findMany({
                      where: { zohoId: { in: deletedZohoIds } },
                      select: { id: true }
                    });
                    const idsToDelete = accountsToDelete.map(a => a.id);
                    if (idsToDelete.length > 0) {
                      // Delete child records first, then the accounts
                      await prisma.note.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.task.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.invoice.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.deal.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.contact.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.quote.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.salesOrder.deleteMany({ where: { accountId: { in: idsToDelete } } });
                      await prisma.account.deleteMany({ where: { id: { in: idsToDelete } } });
                      console.log(`Deleted ${idsToDelete.length} orphaned accounts and their child records.`);
                    }
                  }
                } catch (reassignErr) {
                  console.error("Failed to process reassigned/deleted accounts:", reassignErr);
                }
              }

              // accountMap is already populated above with duplicate handling included.
              // Sync Invoices — cap at 5 pages (500 records)
              try {
                console.log(`Syncing invoices for owner ${syncUser.zohoId}...`);
                let invoicePage = 1;
                let hasMoreInvoices = true;
                let syncedInvoicesCount = 0;
                const MAX_INVOICE_PAGES = 5;
                let zohoInvoices: any[] = [];

                if (!fullPull) {
                  zohoInvoices = globalInvoices.filter(i => i.Owner?.id === syncUser.zohoId);
                  hasMoreInvoices = false;
                }

                while (hasMoreInvoices) {
                  const invoiceRes = await fetch(
                    `https://www.zohoapis.${ZOHO_DC}/crm/v3/Invoices/search?criteria=(Owner.id:equals:${syncUser.zohoId})&page=${invoicePage}&per_page=200`,
                    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                  );

                  if (!invoiceRes.ok) {
                    break;
                  }

                  const invoiceData = await invoiceRes.json();
                  const pageInvoices = (invoiceData as any).data || [];
                  zohoInvoices = [...zohoInvoices, ...pageInvoices];
                  
                  if (invoiceData.info && invoiceData.info.more_records) invoicePage++;
                  else hasMoreInvoices = false;
                }

                if (zohoInvoices.length > 0) {
                  const invoiceOps = [];
                  for (const invRecord of zohoInvoices) {
                    const accountZohoId = invRecord.Account_Name?.id;
                    const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null;
                    
                    let status = invRecord.Status || 'Paid';
                    // Zoho CRM uses "Closed" for paid invoices
                    if (status === 'Closed') status = 'Paid';
                    const dueDate = invRecord.Due_Date ? new Date(invRecord.Due_Date) : null;
                    const NON_OVERDUE = new Set(['Paid', 'Void', 'Voided', 'Draft', 'Writeoff', 'Write_off', 'Write Off', 'Bad Debt', 'paid', 'void', 'voided', 'draft', 'writeoff', 'write_off', 'write off', 'bad debt']);
                    if (!NON_OVERDUE.has(status) && dueDate && dueDate < new Date()) {
                      status = 'Overdue';
                    }

                    if (dbAccountId) {
                      invoiceOps.push(
                        prisma.invoice.upsert({
                            where: { zohoId: invRecord.id },
                            update: {
                              rawData: invRecord,
                              zohoModifiedTime: (invRecord.Modified_Time || invRecord.Updated_Time) ? new Date(invRecord.Modified_Time || invRecord.Updated_Time) : null,
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
                              paymentDate: invRecord.Paid_In_Full_Date,
                              salesperson: invRecord.Sales_Person || null
                            }
                          },
                          create: {
                              rawData: invRecord,
                              zohoModifiedTime: (invRecord.Modified_Time || invRecord.Updated_Time) ? new Date(invRecord.Modified_Time || invRecord.Updated_Time) : null,
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
                              paymentDate: invRecord.Paid_In_Full_Date,
                              salesperson: invRecord.Sales_Person || null
                            }
                          }
                        })
                      );
                    }
                  }

                  for (let i = 0; i < invoiceOps.length; i += 50) {
                    const chunk = invoiceOps.slice(i, i + 50);
                    await prisma.$transaction(chunk);
                    syncedInvoicesCount += chunk.length;
                  }
                }
                console.log(`Synced ${syncedInvoicesCount} invoices for owner ${syncUser.zohoId}.`);
              } catch (invError) {
                console.error("Failed to sync invoices:", invError);
              }

              // Sync Deals
              try {
                let dealPage = 1;
                let hasMoreDeals = true;
                let zohoDeals: any[] = [];

                if (!fullPull) {
                  zohoDeals = globalDeals.filter(d => d.Owner?.id === syncUser.zohoId);
                  hasMoreDeals = false;
                }

                while (hasMoreDeals) {
                  const dealsRes = await fetch(
                    `https://www.zohoapis.${ZOHO_DC}/crm/v3/Deals/search?criteria=(Owner.id:equals:${syncUser.zohoId})&page=${dealPage}&per_page=200`,
                    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                  );
                  if (!dealsRes.ok) break;

                  const dealsData = await dealsRes.json();
                  const pageDeals = (dealsData as any).data || [];
                  zohoDeals = [...zohoDeals, ...pageDeals];

                  if (dealsData.info && dealsData.info.more_records) dealPage++;
                  else hasMoreDeals = false;
                }

                if (zohoDeals.length > 0) {
                  const dealOps = [];
                  for (const dealRecord of zohoDeals) {
                    const accountZohoId = dealRecord.Account_Name?.id;
                    const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null;
                    if (dbAccountId) {
                      dealOps.push(
                        prisma.deal.upsert({
                            where: { zohoId: dealRecord.id },
                            update: {
                              rawData: dealRecord,
                              zohoModifiedTime: (dealRecord.Modified_Time || dealRecord.Updated_Time) ? new Date(dealRecord.Modified_Time || dealRecord.Updated_Time) : null,
                            name: dealRecord.Deal_Name,
                            amount: parseFloat(dealRecord.Amount || 0),
                            stage: dealRecord.Stage,
                            closingDate: dealRecord.Closing_Date ? new Date(dealRecord.Closing_Date) : null,
                          },
                          create: {
                              rawData: dealRecord,
                              zohoModifiedTime: (dealRecord.Modified_Time || dealRecord.Updated_Time) ? new Date(dealRecord.Modified_Time || dealRecord.Updated_Time) : null,
                              zohoId: dealRecord.id,
                            accountId: dbAccountId,
                            ownerId: syncUser.id,
                            name: dealRecord.Deal_Name,
                            amount: parseFloat(dealRecord.Amount || 0),
                            stage: dealRecord.Stage,
                            closingDate: dealRecord.Closing_Date ? new Date(dealRecord.Closing_Date) : null,
                          }
                        })
                      );
                    }
                  }
                  for (let i = 0; i < dealOps.length; i += 50) {
                    await prisma.$transaction(dealOps.slice(i, i + 50));
                  }
                }
              } catch (dealErr) {
                console.error("Failed to sync deals:", dealErr);
              }

              // Sync Sales Orders from Zoho Books — once per full sync
              if (syncUser.id === usersToSync[0]?.id) {
                try {
                  const ZOHO_DC = process.env.ZOHO_DC || 'com';
                  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';
                  const booksBase = `https://www.zohoapis.${ZOHO_DC}/books/v3`;

                  // Build a name-to-accountId map for matching
                  const allAccounts = await prisma.account.findMany({ select: { id: true, name: true } });
                  const nameMap = new Map<string, string>();
                  allAccounts.forEach(a => nameMap.set(a.name.toLowerCase().trim(), a.id));

                  // Sync Sales Orders
                  console.log("Syncing sales orders from Zoho Books...");
                  let soPage = 1;
                  let soSynced = 0;
                  let hasMoreSO = true;
                  while (hasMoreSO && soPage <= 3) {
                    const soRes = await fetch(
                      `${booksBase}/salesorders?organization_id=${ORG_ID}&page=${soPage}&per_page=200&sort_column=date&sort_order=D`,
                      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                    );
                    if (!soRes.ok) break;
                    const soData: any = await soRes.json();
                    const orders = soData.salesorders || [];
                    if (orders.length === 0) break;

                    const soOps = [];
                    for (const so of orders) {
                      const custName = (so.customer_name || '').toLowerCase().trim();
                      const dbAccountId = nameMap.get(custName);
                      if (!dbAccountId || !so.salesorder_id) continue;
                      soOps.push(
                        prisma.salesOrder.upsert({
                          where: { zohoId: so.salesorder_id },
                          update: {
                            amount: parseFloat(so.sub_total || so.total || 0),
                            status: so.order_status || so.status || 'Pending',
                            orderDate: new Date(so.date || so.created_time),
                            items: {
                              salesOrderNumber: so.salesorder_number,
                              salesperson: so.salesperson_name || null,
                            }
                          },
                          create: {
                            zohoId: so.salesorder_id,
                            accountId: dbAccountId,
                            amount: parseFloat(so.sub_total || so.total || 0),
                            status: so.order_status || so.status || 'Pending',
                            orderDate: new Date(so.date || so.created_time),
                            items: {
                              salesOrderNumber: so.salesorder_number,
                              salesperson: so.salesperson_name || null,
                            }
                          }
                        })
                      );
                    }
                    for (let i = 0; i < soOps.length; i += 50) {
                      await prisma.$transaction(soOps.slice(i, i + 50));
                      soSynced += Math.min(50, soOps.length - i);
                    }
                    hasMoreSO = soData.page_context?.has_more_page || false;
                    soPage++;
                  }
                  console.log(`Synced ${soSynced} sales orders from Books.`);

                  // Sync Estimates (Quotes)
                  console.log("Syncing estimates (quotes) from Zoho Books...");
                  let estPage = 1;
                  let estSynced = 0;
                  let hasMoreEst = true;
                  while (hasMoreEst && estPage <= 3) {
                    const estRes = await fetch(
                      `${booksBase}/estimates?organization_id=${ORG_ID}&page=${estPage}&per_page=200&sort_column=date&sort_order=D`,
                      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                    );
                    if (!estRes.ok) break;
                    const estData: any = await estRes.json();
                    const estimates = estData.estimates || [];
                    if (estimates.length === 0) break;

                    const estOps = [];
                    for (const est of estimates) {
                      const custName = (est.customer_name || '').toLowerCase().trim();
                      const dbAccountId = nameMap.get(custName);
                      if (!dbAccountId || !est.estimate_id) continue;
                      estOps.push(
                        prisma.quote.upsert({
                          where: { zohoId: est.estimate_id },
                          update: {
                            amount: parseFloat(est.sub_total || est.total || 0),
                            status: est.status || 'Draft',
                            items: {
                              estimateNumber: est.estimate_number,
                              salesperson: est.salesperson_name || null,
                            }
                          },
                          create: {
                            zohoId: est.estimate_id,
                            accountId: dbAccountId,
                            amount: parseFloat(est.sub_total || est.total || 0),
                            status: est.status || 'Draft',
                            items: {
                              estimateNumber: est.estimate_number,
                              salesperson: est.salesperson_name || null,
                            }
                          }
                        })
                      );
                    }
                    for (let i = 0; i < estOps.length; i += 50) {
                      await prisma.$transaction(estOps.slice(i, i + 50));
                      estSynced += Math.min(50, estOps.length - i);
                    }
                    hasMoreEst = estData.page_context?.has_more_page || false;
                    estPage++;
                  }
                  console.log(`Synced ${estSynced} estimates (quotes) from Books.`);
                } catch (booksErr) {
                  console.error("Failed to sync sales orders/estimates from Books:", booksErr);
                }
              }

              // Sync Contacts — cap at 3 pages (300 records)
              try {
                console.log(`Syncing contacts for owner ${syncUser.zohoId}...`);
                let contactPage = 1;
                let hasMoreContacts = true;
                let syncedContactsCount = 0;
                let zohoContacts: any[] = [];

                if (!fullPull) {
                  zohoContacts = globalContacts.filter(c => c.Owner?.id === syncUser.zohoId);
                  hasMoreContacts = false;
                }

                const localContactsBefore = await prisma.contact.findMany({
                  where: { accountId: { in: Array.from(accountMap.values()) } },
                  select: { id: true, email: true, phone: true, accountId: true }
                });
                const seenContactEmails = new Set();
                const seenContactPhones = new Set();
                localContactsBefore.forEach(c => {
                  if (c.email) seenContactEmails.add(`${c.accountId}-${c.email.toLowerCase().trim()}`);
                  if (c.phone) seenContactPhones.add(`${c.accountId}-${c.phone.trim()}`);
                });

                while (hasMoreContacts) {
                  const contactRes = await fetch(
                    `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=(Owner.id:equals:${syncUser.zohoId})&page=${contactPage}&per_page=200`,
                    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                  );

                  if (!contactRes.ok) {
                    break;
                  }

                  const contactData = await contactRes.json();
                  const pageContacts = (contactData as any).data || [];
                  zohoContacts = [...zohoContacts, ...pageContacts];

                  if (contactData.info && contactData.info.more_records) contactPage++;
                  else hasMoreContacts = false;
                }

                if (zohoContacts.length > 0) {
                  const contactOps = [];
                  for (const contactRecord of zohoContacts) {
                    const accountZohoId = contactRecord.Account_Name?.id;
                    const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null;
                    if (dbAccountId) {
                      const emailVal = contactRecord.Email;
                      const phoneVal = contactRecord.Phone;
                      const emailKey = emailVal ? `${dbAccountId}-${emailVal.toLowerCase().trim()}` : null;
                      const phoneKey = phoneVal ? `${dbAccountId}-${phoneVal.trim()}` : null;

                      if ((emailKey && seenContactEmails.has(emailKey)) || (phoneKey && seenContactPhones.has(phoneKey))) {
                        continue;
                      }

                      if (emailKey) seenContactEmails.add(emailKey);
                      if (phoneKey) seenContactPhones.add(phoneKey);

                      contactOps.push(
                        prisma.contact.upsert({
                            where: { zohoId: contactRecord.id },
                            update: {
                              rawData: contactRecord,
                              zohoModifiedTime: (contactRecord.Modified_Time || contactRecord.Updated_Time) ? new Date(contactRecord.Modified_Time || contactRecord.Updated_Time) : null,
                            firstName: contactRecord.First_Name || null,
                            lastName: contactRecord.Last_Name || null,
                            email: contactRecord.Email || null,
                            phone: contactRecord.Phone || null,
                            mobilePhone: contactRecord.Mobile || null, mailingStreet: contactRecord.Mailing_Street || null, mailingCity: contactRecord.Mailing_City || null, mailingState: contactRecord.Mailing_State || null, mailingZip: contactRecord.Mailing_Zip || null,
                          },
                          create: {
                              rawData: contactRecord,
                              zohoModifiedTime: (contactRecord.Modified_Time || contactRecord.Updated_Time) ? new Date(contactRecord.Modified_Time || contactRecord.Updated_Time) : null,
                              zohoId: contactRecord.id,
                            accountId: dbAccountId,
                            firstName: contactRecord.First_Name || null,
                            lastName: contactRecord.Last_Name || null,
                            email: contactRecord.Email || null,
                            phone: contactRecord.Phone || null,
                            mobilePhone: contactRecord.Mobile || null, mailingStreet: contactRecord.Mailing_Street || null, mailingCity: contactRecord.Mailing_City || null, mailingState: contactRecord.Mailing_State || null, mailingZip: contactRecord.Mailing_Zip || null,
                          }
                        })
                      );
                    }
                  }

                  for (let i = 0; i < contactOps.length; i += 50) {
                    const chunk = contactOps.slice(i, i + 50);
                    await prisma.$transaction(chunk);
                    syncedContactsCount += chunk.length;
                  }
                }
                console.log(`Synced ${syncedContactsCount} contacts for owner ${syncUser.zohoId}.`);

                // Delete contacts that no longer exist in Zoho
                try {
                  const syncedContactZohoIds = new Set<string>();
                  // We need to collect all contact zohoIds we just synced
                  const localContactsAfterSync = await prisma.contact.findMany({
                    where: { accountId: { in: Array.from(new Set(accountMap.values())) } },
                    select: { id: true, zohoId: true }
                  });
                  // Check which local contacts are NOT in Zoho anymore
                  const contactZohoIdsToCheck = localContactsAfterSync
                    .map(c => c.zohoId)
                    .filter(Boolean);
                  
                  if (contactZohoIdsToCheck.length > 0) {
                    const deletedContactIds: string[] = [];
                    for (let ci = 0; ci < contactZohoIdsToCheck.length; ci += 50) {
                      const chunk = contactZohoIdsToCheck.slice(ci, ci + 50);
                      const checkRes = await fetch(
                        `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts?ids=${chunk.join(",")}`,
                        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                      );
                      const foundIds = new Set<string>();
                      if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        (checkData.data || []).forEach((r: any) => foundIds.add(r.id));
                      }
                      for (const zid of chunk) {
                        if (!foundIds.has(zid)) {
                          const localContact = localContactsAfterSync.find(c => c.zohoId === zid);
                          if (localContact) deletedContactIds.push(localContact.id);
                        }
                      }
                    }
                    if (deletedContactIds.length > 0) {
                      await prisma.contact.deleteMany({ where: { id: { in: deletedContactIds } } });
                      console.log(`Deleted ${deletedContactIds.length} contacts removed from Zoho CRM.`);
                    }
                  }
                } catch (delContactErr) {
                  console.error("Failed to delete orphaned contacts:", delContactErr);
                }
              } catch (contactError) {
                console.error("Failed to sync contacts:", contactError);
              }
            }
          }

        // Sync books payments in real-time
        await syncRecentBooksInvoices();

        // Auto-compute customer quality based on invoice history
        // Rules: no invoices = NEVER_STATUSED, >12 months = COLD, 6-12 months = WARM, <6 months = HOT
        // Skip DO_NOT_CALL and ON_HOLD (manual overrides)
        try {
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

          const accountIds = (await prisma.account.findMany({ where: { ownerId: { in: usersToSync.map(u => u.id) } }, select: { id: true } })).map(a => a.id);
          const accountsWithInvoices = await prisma.account.findMany({
            where: {
              id: { in: accountIds },
              quality: { notIn: ['DO_NOT_CALL', 'ON_HOLD'] }
            },
            select: {
              id: true,
              quality: true,
              invoices: {
                select: { issueDate: true, status: true },
                where: { status: { notIn: ['Void', 'Draft', 'Writeoff', 'Write_off', 'Write Off', 'Bad Debt'] } },
                orderBy: { issueDate: 'desc' },
                take: 1
              }
            }
          });

          const qualityUpdates: any[] = [];
          for (const acct of accountsWithInvoices) {
            let newQuality: string;
            const latestInvoice = acct.invoices[0];
            if (!latestInvoice || !latestInvoice.issueDate) {
              newQuality = 'NEVER_STATUSED';
            } else {
              const invoiceDate = new Date(latestInvoice.issueDate);
              if (invoiceDate >= sixMonthsAgo) {
                newQuality = 'HOT';
              } else if (invoiceDate >= twelveMonthsAgo) {
                newQuality = 'WARM';
              } else {
                newQuality = 'COLD';
              }
            }
            if (newQuality !== acct.quality) {
              qualityUpdates.push(
                prisma.account.update({
                  where: { id: acct.id },
                  data: { quality: newQuality }
                })
              );
            }
          }
          if (qualityUpdates.length > 0) {
            for (let qi = 0; qi < qualityUpdates.length; qi += 50) {
              await prisma.$transaction(qualityUpdates.slice(qi, qi + 50));
            }
            console.log(`Auto-computed quality for ${qualityUpdates.length} accounts.`);
          }
        } catch (qualityErr) {
          console.error("Failed to auto-compute customer quality:", qualityErr);
        }

      } catch (zohoError) {
        console.error("Failed to sync with live Zoho CRM:", zohoError);
      }
    }

    // Scoping query:
    // 1. Account Owner can see all docs for their owned accounts.
    // 2. Sales rep can see any accounts where they are the salesperson on any invoice, quote, or salesOrder, with minimal account info if they do not own the account.
    // To support this, we must fetch accounts, quotes, and salesOrders, plus the items inside invoices.
    
    let dbAccounts: any[] = [];
    if (isSalesOnly) {
      // Sales rep: only fetch accounts they own
      const salesRepWhere: any = { ownerId: user.id };
      if (search) salesRepWhere.name = { contains: search, mode: 'insensitive' };
      if (statusFilter) salesRepWhere.status = statusFilter;
      const totalCount = await prisma.account.count({ where: salesRepWhere });
      dbAccounts = await prisma.account.findMany({
        where: salesRepWhere,
        orderBy: { name: 'asc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          zohoId: true,
          name: true,
          tags: true,
          status: true,
          quality: true,
          lastCalledAt: true,
          lastPurchaseAt: true,
          ownerId: true,
          industry: true,
          timeZone: true, billingStreet: true, billingCity: true, billingState: true, billingZip: true, shippingStreet: true, shippingCity: true, shippingState: true, shippingZip: true, bladeSizes: true, materialsCut: true, currentSupplier: true, averageBladeCost: true, crewCount: true, bladesPerOrder: true, improvementPriority: true,
          invoices: {
            select: {
              id: true, zohoId: true, amount: true, status: true, items: true, issueDate: true, createdAt: true,
              ...(wantDocs ? { dueDate: true } : {})
            }
          },
          ...(wantDocs ? {
            quotes: { select: { id: true, zohoId: true, amount: true, status: true, items: true, createdAt: true } },
            salesOrders: { select: { id: true, zohoId: true, amount: true, status: true, items: true, orderDate: true, createdAt: true } }
          } : {}),
          contacts: {
            select: {
              phone: true, mobilePhone: true, isPrimary: true, firstName: true, lastName: true, mailingStreet: true, mailingCity: true, mailingState: true, mailingZip: true
            }
          },
          owner: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      });
      (dbAccounts as any)._totalCount = totalCount;

    } else {
      // Admin / Manager / Collections: can see all
      let adminWhere: any = {};
      if (ownerIdFilter && ownerIdFilter !== "all" && ownerIdFilter !== "All") {
        adminWhere = { ownerId: ownerIdFilter };
      }
      
      if (search) adminWhere.name = { contains: search, mode: 'insensitive' };
      if (statusFilter) adminWhere.status = statusFilter;
      const totalCount = await prisma.account.count({ where: adminWhere });
      dbAccounts = await prisma.account.findMany({
        where: adminWhere,
        orderBy: { name: 'asc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          zohoId: true,
          name: true,
          tags: true,
          status: true,
          quality: true,
          lastCalledAt: true,
          lastPurchaseAt: true,
          ownerId: true,
          industry: true,
          timeZone: true, billingStreet: true, billingCity: true, billingState: true, billingZip: true, shippingStreet: true, shippingCity: true, shippingState: true, shippingZip: true, bladeSizes: true, materialsCut: true, currentSupplier: true, averageBladeCost: true, crewCount: true, bladesPerOrder: true, improvementPriority: true,
          invoices: {
            select: {
              id: true, zohoId: true, amount: true, status: true, items: true, issueDate: true, createdAt: true,
              ...(wantDocs ? { dueDate: true } : {})
            }
          },
          ...(wantDocs ? {
            quotes: { select: { id: true, zohoId: true, amount: true, status: true, items: true, createdAt: true } },
            salesOrders: { select: { id: true, zohoId: true, amount: true, status: true, items: true, orderDate: true, createdAt: true } }
          } : {}),
          contacts: {
            select: {
              phone: true, mobilePhone: true, isPrimary: true, firstName: true, lastName: true, mailingStreet: true, mailingCity: true, mailingState: true, mailingZip: true
            }
          },
          owner: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      });
      (dbAccounts as any)._totalCount = totalCount;
    }

    // Prune: aggregate invoices server-side, keep only primary contact. Stays well under 6MB Lambda limit.
    const totalCount = (dbAccounts as any)._totalCount ?? dbAccounts.length;
    const EXCLUDED_STATUSES = new Set(['Writeoff', 'Write_off', 'Write Off', 'Bad Debt', 'Void', 'Draft']);
    const accounts = dbAccounts.map((acc: any) => {
      const invoices: any[] = acc.invoices || [];
      let totalSales = 0, totalProfit = 0, overdueBalance = 0, overdueCount = 0;
      let latestPaidInvoiceDate: Date | null = null;
      for (const inv of invoices) {
        const s = inv.status || '';
        if (EXCLUDED_STATUSES.has(s)) continue;
        totalSales += inv.amount || 0;
        totalProfit += parseFloat(inv.items?.profit || 0);
        if (s === 'Overdue' || s.toLowerCase() === 'overdue') {
          overdueCount++;
          const bal = inv.items?.balance != null ? parseFloat(inv.items.balance) : (inv.amount || 0);
          overdueBalance += isNaN(bal) ? 0 : bal;
        }
        // Track latest invoice date for lastPurchaseAt fallback (any non-excluded invoice = a purchase)
        const invDate = inv.issueDate || inv.items?.date || inv.createdAt;
        if (invDate) {
          const d = new Date(invDate);
          if (!latestPaidInvoiceDate || d > latestPaidInvoiceDate) {
            latestPaidInvoiceDate = d;
          }
        }
      }
      // If CRM didn't provide lastPurchaseAt but we have paid invoices, derive it
      const effectiveLastPurchaseAt = acc.lastPurchaseAt || latestPaidInvoiceDate;

      const primaryContact = acc.contacts?.find((c: any) => c.isPrimary) || acc.contacts?.[0] || null;
      return {
        id: acc.id,
        zohoId: acc.zohoId,
        name: acc.name,
        tags: acc.tags,
        status: acc.status,
        quality: acc.quality,
        lastCalledAt: acc.lastCalledAt,
        lastPurchaseAt: effectiveLastPurchaseAt,
        ownerId: acc.ownerId,
        industry: acc.industry,
        timeZone: acc.timeZone, billingStreet: acc.billingStreet, billingCity: acc.billingCity, billingState: acc.billingState, billingZip: acc.billingZip, shippingStreet: acc.shippingStreet, shippingCity: acc.shippingCity, shippingState: acc.shippingState, shippingZip: acc.shippingZip, bladeSizes: acc.bladeSizes, materialsCut: acc.materialsCut, currentSupplier: acc.currentSupplier, averageBladeCost: acc.averageBladeCost, crewCount: acc.crewCount, bladesPerOrder: acc.bladesPerOrder, improvementPriority: acc.improvementPriority,
        owner: acc.owner,
        totalSales,
        totalProfit,
        overdueBalance,
        overdueCount,
        contacts: primaryContact ? [primaryContact] : [],
        ...(wantDocs ? {
          invoices: acc.invoices || [],
          quotes: acc.quotes || [],
          salesOrders: acc.salesOrders || [],
        } : {}),
        _count: acc._count || { invoices: 0, quotes: 0, salesOrders: 0 },
      };
    });

    // Query list of reps for admin dropdown population
    let reps: any[] = [];
    if (isAdmin) {
      reps = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          zohoId: true,
          role: true,
        },
        orderBy: { name: "asc" }
      });
      
      const visibleRepsSetting = await prisma.systemSetting.findUnique({ where: { key: "visible_reps" } });
      const visibleReps: string[] = JSON.parse(visibleRepsSetting?.value || "[]");
      if (!showHidden && visibleReps.length > 0) {
        reps = reps.filter(r => visibleReps.includes(r.id));
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        accounts,
        reps,
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          totalCount,
          hasMore: page * PAGE_SIZE < totalCount
        }
      })
    }

  } catch (error: any) {
    console.error("Get Accounts Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
