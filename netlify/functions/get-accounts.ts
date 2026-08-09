import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { syncRecentBooksInvoices } from "./lib/zoho-books"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';


export const handler: Handler = async (event, context) => {
  // Allow GET requests
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    let { zohoId, email, refresh, force, ownerIdFilter, statusFilter, role: passedRole, page: pageParam, limit: limitParam, search, includeDocs, includeHidden, checkOnly } = event.queryStringParameters || {}

  // Load admin email aliases from SystemSettings (key: 'admin_email_aliases', comma-separated)
  let adminEmailAliases: Record<string, string> = {}
  let adminEmailPatterns: string[] = []
  try {
    const [aliasRow, patternRow] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'admin_email_aliases' } }),
      prisma.systemSetting.findUnique({ where: { key: 'admin_email_patterns' } })
    ])
    if (aliasRow?.value) adminEmailAliases = JSON.parse(aliasRow.value)
    if (patternRow?.value) adminEmailPatterns = patternRow.value.split(',').map(s => s.trim().toLowerCase())
  } catch { /* use defaults below */ }

  // Apply email alias (e.g. admin@ → primary email) from DB settings
  if (email && adminEmailAliases[email.toLowerCase()]) {
    email = adminEmailAliases[email.toLowerCase()]
  }
    const wantDocs = includeDocs === 'true'
    const showHidden = includeHidden === 'true'
    const parsedLimit = parseInt(limitParam || '2000', 10)
    const PAGE_SIZE = isNaN(parsedLimit) || parsedLimit <= 0 ? 2000 : Math.min(parsedLimit, 10000)
    const page = parseInt(pageParam || '1', 10)
    let user = null

    // 1. Try to find the user by their Zoho CRM User ID or Prisma CUID
    if (zohoId) {
      if (zohoId.startsWith('c') && zohoId.length >= 20) {
        user = await prisma.user.findUnique({ where: { id: zohoId } })
      } else {
        user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
      }
    }

    // 2. Fall back to finding them by email (case-insensitive)
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
    }

    if (!user) {
      user = await prisma.user.findFirst()
      if (!user) {
        try {
          user = await prisma.user.create({
            data: {
              email: email || `demo-${Date.now()}@titandiamond.net`,
              zohoId: zohoId || `mock-zoho-${Date.now()}`,
              name: email ? email.split('@')[0] : 'Demo User',
              role: passedRole || 'Administrator'
            }
          })
        } catch (err) {
          console.error("User auto-create error:", err)
        }
      }
    }

    // Auto-heal roles using DB-configured patterns instead of hard-coded names
    if (user) {
      let needsUpdate = false
      const updateData: any = {}
      const lowerEmail = user.email?.toLowerCase() || ''

      // Check if this user should be force-elevated to Administrator
      // Patterns come from SystemSetting 'admin_email_patterns' (comma-separated substrings)
      const shouldBeAdmin = adminEmailPatterns.length > 0
        ? adminEmailPatterns.some(p => lowerEmail.includes(p))
        : false // If no patterns configured, don't auto-elevate anyone

      if (shouldBeAdmin && user.role !== 'Administrator') {
        updateData.role = 'Administrator'
        needsUpdate = true
      }

      if (needsUpdate) {
        console.log(`[get-accounts] Auto-healing role for ${user.email}...`)
        user = await prisma.user.update({ where: { id: user.id }, data: updateData })
      }
    }

    const userEmailLower = (user?.email || email || '').toLowerCase()
    const userRoleLower  = (passedRole || user?.role || '').toLowerCase()
    // Admin detection: role-based OR matching admin email patterns
    const isAdmin = userRoleLower.includes('admin') || userRoleLower.includes('administrator') || userRoleLower.includes('manager')
      || (adminEmailPatterns.length > 0 && adminEmailPatterns.some(p => userEmailLower.includes(p)))
    const isSalesOnly = !isAdmin

    // 3. Only sync LIVE accounts from Zoho CRM if explicitly requested via refresh=true.
    let shouldSync = false
    if (refresh === 'true') {
      const lastUpdatedAccount = await prisma.account.findFirst({
        where: isSalesOnly && user ? { ownerId: user.id } : {},
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

    // ── checkOnly mode: single fast DB query, no data returned ────────────
    // Used by the frontend to silently check if new data is available.
    // Returns: { hasUpdates: bool, count: number, latestUpdatedAt: string }
    if (checkOnly === 'true') {
      const where = isSalesOnly && user ? { ownerId: user.id } : {}
      const [count, latest] = await Promise.all([
        prisma.account.count({ where }),
        prisma.account.findFirst({ where, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      ])
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          success: true,
          checkOnly: true,
          count,
          latestUpdatedAt: latest?.updatedAt ?? null,
        })
      }
    }

    if (shouldSync) {
      try {
        const token = await getZohoAccessToken();
        
        let usersToSync: any[] = [user].filter(Boolean)
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
                const roleName = zUser.profile?.name || 'Sales Representative'
                // displayName comes from Zoho CRM — no hard-coded overrides
                const displayName = zUser.full_name || zUser.name
                await prisma.user.upsert({
                  where: { zohoId: zUser.id },
                  update: {
                    name: displayName,
                    email: zUser.email,
                    role: roleName,
                  },
                  create: {
                    zohoId: zUser.id,
                    name: displayName,
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
          if (!syncUser || !syncUser.zohoId) continue;
          
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
              // Sync Invoices — fetch ALL invoices for ALL accounts assigned to this rep,
              // not just invoices where Owner.id = rep. This ensures reps can see every
              // invoice on their accounts regardless of who created it in Zoho.
              try {
                const repAccountZohoIds = Array.from(accountMap.keys());
                console.log(`Syncing invoices for ${repAccountZohoIds.length} accounts assigned to ${syncUser.zohoId}...`);
                let syncedInvoicesCount = 0;
                let zohoInvoices: any[] = [];

                if (!fullPull) {
                  // In incremental mode, filter the global invoice pull by whether
                  // the invoice's account belongs to this rep (not by owner)
                  const repAccountSet = new Set(repAccountZohoIds);
                  zohoInvoices = globalInvoices.filter(i => repAccountSet.has(i.Account_Name?.id));
                } else {
                  // In full-pull mode, batch-fetch by Account_Name.id in chunks of 10
                  // to keep URL lengths manageable
                  const CHUNK_SIZE = 10;
                  for (let ci = 0; ci < repAccountZohoIds.length; ci += CHUNK_SIZE) {
                    const idChunk = repAccountZohoIds.slice(ci, ci + CHUNK_SIZE);
                    const criteria = idChunk.map(id => `(Account_Name.id:equals:${id})`).join('or');
                    let invPage = 1;
                    let hasMore = true;
                    while (hasMore) {
                      try {
                        const invoiceRes = await fetch(
                          `https://www.zohoapis.${ZOHO_DC}/crm/v3/Invoices/search?criteria=${encodeURIComponent(criteria)}&page=${invPage}&per_page=200`,
                          { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                        );
                        if (!invoiceRes.ok) { hasMore = false; break; }
                        const invoiceData = await invoiceRes.json();
                        const pageInvoices = (invoiceData as any).data || [];
                        zohoInvoices = [...zohoInvoices, ...pageInvoices];
                        if (invoiceData.info && invoiceData.info.more_records) invPage++;
                        else hasMore = false;
                      } catch (fetchErr) {
                        console.error(`Failed to fetch invoices for account chunk:`, fetchErr);
                        hasMore = false;
                      }
                    }
                  }
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
                            issueDate: new Date(invRecord.Invoice_Date || invRecord.Due_Date || invRecord.Created_Time),
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
                            issueDate: new Date(invRecord.Invoice_Date || invRecord.Due_Date || invRecord.Created_Time),
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
                console.log(`Synced ${syncedInvoicesCount} invoices across ${repAccountZohoIds.length} accounts for ${syncUser.zohoId}.`);
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
                  while (hasMoreSO && soPage <= 2) {
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
                  while (hasMoreEst && estPage <= 2) {
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

    // PERF: single $queryRaw does all SUM/COUNT/json_agg in PostgreSQL.
    // Static status exclusion list is embedded as a literal SQL string (safe — not user input).
    // Parameterized values (owner IDs, search, status) use Prisma.sql interpolation.

    // Build scope filter
    let scopeSql: Prisma.Sql = Prisma.empty
    if (isSalesOnly && user) {
      const ownerIds = [user.id, user.zohoId, user.email].filter(Boolean) as string[]
      scopeSql = Prisma.sql`AND a."ownerId" = ANY(ARRAY[${Prisma.join(ownerIds)}]::text[])`
    } else if (ownerIdFilter && ownerIdFilter !== 'all' && ownerIdFilter !== 'All' && !ownerIdFilter.toLowerCase().includes('myself')) {
      const matchingUsers = await prisma.user.findMany({
        where: {
          OR: [
            { id: ownerIdFilter },
            { zohoId: ownerIdFilter },
            { email: { equals: ownerIdFilter, mode: 'insensitive' } },
            { name: { contains: ownerIdFilter, mode: 'insensitive' } }
          ]
        }
      })
      if (matchingUsers.length > 0) {
        const ids = matchingUsers.flatMap((u: any) => [u.id, u.zohoId, u.email].filter(Boolean)) as string[]
        scopeSql = Prisma.sql`AND a."ownerId" = ANY(ARRAY[${Prisma.join(ids)}]::text[])`
      }
    }

    const statusSql: Prisma.Sql = statusFilter
      ? Prisma.sql`AND a.status = ${statusFilter}`
      : Prisma.sql`AND a.status NOT IN ('Inactive','Do Not Contact','DNR')`

    const searchSql: Prisma.Sql = search
      ? Prisma.sql`AND a.name ILIKE ${'%' + search + '%'}`
      : Prisma.empty

    // Static exclusion list embedded as SQL literal — never comes from user input
    const EXCL_SQL = `'Void','void','Voided','voided','Draft','draft','Writeoff','Write_off','Write Off','Bad Debt','writeoff','write_off','write off','bad debt'`

    // Fast count for pagination
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Account" a WHERE 1=1 ${scopeSql} ${statusSql} ${searchSql}`
    )
    const totalCount = Number(countResult[0]?.count ?? 0)

    // Main aggregation query — all invoice math in PostgreSQL, zero items blobs on the wire
    const dbAccounts: any[] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        a.id::text, a."zohoId", a.name, a.tags, a.status, a.quality,
        a."lastCalledAt", a."lastPurchaseAt", a."ownerId", a.industry, a."timeZone",
        a."billingStreet", a."billingCity", a."billingState", a."billingZip",
        a."shippingStreet", a."shippingCity", a."shippingState", a."shippingZip",
        a."bladeSizes", a."materialsCut", a."currentSupplier", a."averageBladeCost",
        a."crewCount", a."bladesPerOrder", a."improvementPriority",
        u.id::text AS "ownerId_u", u.name AS "ownerName", u.email AS "ownerEmail", u.role AS "ownerRole",
        -- totalSales: sum of all non-excluded invoice amounts
        COALESCE(SUM(i.amount) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
        ), 0)::float AS "totalSales",
        -- totalProfit: prefer computed column, fall back to items JSON
        COALESCE(SUM(COALESCE(i."computedProfit", (i.items->>'profit')::float)) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
        ), 0)::float AS "totalProfit",
        -- overdue
        COALESCE(SUM(COALESCE(i.balance, i.amount)) FILTER (
          WHERE i.status ILIKE '%overdue%'
        ), 0)::float AS "overdueBalance",
        COALESCE(COUNT(i.id) FILTER (
          WHERE i.status ILIKE '%overdue%'
        ), 0)::int AS "overdueCount",
        -- unpaid (open balance > 0, not paid/excluded)
        COALESCE(SUM(COALESCE(i.balance, i.amount)) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
            AND i.status <> 'Paid'
            AND COALESCE(i.balance, i.amount) > 0
        ), 0)::float AS "unpaidBalance",
        COALESCE(COUNT(i.id) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
            AND i.status <> 'Paid'
            AND COALESCE(i.balance, i.amount) > 0
        ), 0)::int AS "unpaidCount",
        -- latest invoice date for lastPurchaseAt fallback
        MAX(i."issueDate") FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
        ) AS "latestInvoiceDate",
        -- lightweight unpaid invoice list (no items blob)
        COALESCE(json_agg(json_build_object(
          'invoiceNumber', COALESCE(i."computedInvoiceNumber", i.items->>'invoiceNumber', i.items->>'invoice_number', i."zohoId"),
          'dueDate',       i."dueDate",
          'balance',       COALESCE(i.balance, i.amount),
          'status',        i.status,
          'amount',        i.amount
        )) FILTER (
          WHERE i.status NOT IN (${Prisma.raw(EXCL_SQL)})
            AND i.status <> 'Paid'
            AND COALESCE(i.balance, i.amount) > 0
        ), '[]'::json) AS "unpaidInvoiceSummary",
        -- primary contact only (no full array)
        (SELECT row_to_json(c) FROM (
          SELECT c2.phone, c2."mobilePhone", c2."isPrimary", c2."firstName", c2."lastName",
                 c2."mailingStreet", c2."mailingCity", c2."mailingState", c2."mailingZip"
          FROM "Contact" c2 WHERE c2."accountId" = a.id ORDER BY c2."isPrimary" DESC LIMIT 1
        ) c) AS "primaryContact"
      FROM "Account" a
      LEFT JOIN "User" u ON u.id = a."ownerId"
      LEFT JOIN "Invoice" i ON i."accountId" = a.id
      WHERE 1=1 ${scopeSql} ${statusSql} ${searchSql}
      GROUP BY
        a.id, a."zohoId", a.name, a.tags, a.status, a.quality,
        a."lastCalledAt", a."lastPurchaseAt", a."ownerId", a.industry, a."timeZone",
        a."billingStreet", a."billingCity", a."billingState", a."billingZip",
        a."shippingStreet", a."shippingCity", a."shippingState", a."shippingZip",
        a."bladeSizes", a."materialsCut", a."currentSupplier", a."averageBladeCost",
        a."crewCount", a."bladesPerOrder", a."improvementPriority",
        u.id, u.name, u.email, u.role
      ORDER BY a.name ASC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `)

    // Map flat rows → response shape, no JS aggregation loops
    const accounts = dbAccounts.map((acc: any) => ({
      id: acc.id,
      zohoId: acc.zohoId,
      name: acc.name,
      tags: acc.tags,
      status: acc.status,
      quality: acc.quality,
      lastCalledAt: acc.lastCalledAt,
      lastPurchaseAt: acc.lastPurchaseAt || acc.latestInvoiceDate,
      ownerId: acc.ownerId,
      industry: acc.industry,
      timeZone: acc.timeZone,
      billingStreet: acc.billingStreet, billingCity: acc.billingCity,
      billingState: acc.billingState,   billingZip: acc.billingZip,
      shippingStreet: acc.shippingStreet, shippingCity: acc.shippingCity,
      shippingState: acc.shippingState,   shippingZip: acc.shippingZip,
      bladeSizes: acc.bladeSizes, materialsCut: acc.materialsCut,
      currentSupplier: acc.currentSupplier, averageBladeCost: acc.averageBladeCost,
      crewCount: acc.crewCount, bladesPerOrder: acc.bladesPerOrder,
      improvementPriority: acc.improvementPriority,
      owner: acc.ownerName ? { id: acc.ownerId_u, name: acc.ownerName, email: acc.ownerEmail, role: acc.ownerRole } : null,
      totalSales:           parseFloat(acc.totalSales)    || 0,
      totalProfit:          parseFloat(acc.totalProfit)   || 0,
      overdueBalance:       parseFloat(acc.overdueBalance)|| 0,
      overdueCount:         parseInt(acc.overdueCount)    || 0,
      unpaidBalance:        parseFloat(acc.unpaidBalance) || 0,
      unpaidCount:          parseInt(acc.unpaidCount)     || 0,
      unpaidInvoiceSummary: Array.isArray(acc.unpaidInvoiceSummary) ? acc.unpaidInvoiceSummary : [],
      purchasedProductNames: [],
      contacts: acc.primaryContact ? [acc.primaryContact] : [],
      _count: { invoices: parseInt(acc.unpaidCount) || 0, quotes: 0, salesOrders: 0 },
    }))


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
