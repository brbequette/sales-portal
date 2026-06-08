import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Module-level token cache
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
const ZOHO_DC = process.env.ZOHO_DC || 'com';

async function processInChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map(fn));
  }
}

async function getZohoAccessToken() {
  const now = Date.now();

  // 1. Return cached token if still valid
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

  // 2. Try OAuth refresh_token flow
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });

      const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await res.json();
      if (data.access_token) {
        _cachedToken = data.access_token;
        _tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
        return _cachedToken;
      }
      console.warn('Zoho Token Refresh failed:', JSON.stringify(data));
    } catch (e: any) {
      console.warn('Zoho Token fetch error:', e.message);
    }
  }

  // 3. Fallback: use a static access token set as an env var if defined
  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 55 * 60 * 1000;
    return _cachedToken;
  }

  throw new Error('No Zoho access token available. Please set ZOHO_REFRESH_TOKEN in Environment Variables.');
}

export const handler: Handler = async (event, context) => {
  // Allow GET requests
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const { zohoId, email, refresh, ownerIdFilter } = event.queryStringParameters || {}

    if (!zohoId && !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing zohoId or email parameter" })
      }
    }

    let user = null

    // 1. Try to find the user by their Zoho CRM User ID
    if (zohoId) {
      user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
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
          role: 'Sales Representative'
        }
      })
    }

    // 3. Only sync LIVE accounts from Zoho CRM if explicitly requested via refresh=true.
    //    This prevents hammering Zoho API limits on every page load.
    //    Normal dashboard loads always read from the local Neon DB.
    let shouldSync = false
    if (refresh === 'true' && user.zohoId && !user.zohoId.startsWith('mock-zoho')) {
      const lastUpdatedAccount = await prisma.account.findFirst({
        where: { ownerId: user.id },
        orderBy: { updatedAt: 'desc' }
      })

      // Hard minimum: never sync more than once per 60 minutes even if refresh is requested
      const syncCooldownMs = 60 * 60 * 1000 // 60 minutes
      const hasRecentSync = lastUpdatedAccount && (Date.now() - new Date(lastUpdatedAccount.updatedAt).getTime() < syncCooldownMs)

      if (!hasRecentSync) {
        shouldSync = true
      } else {
        console.log(`Skipping Zoho sync for user ${user.email} — synced within the last hour. Use the refresh button again in an hour.`)
      }
    }

    if (shouldSync && user.zohoId) {
      try {
        const token = await getZohoAccessToken();
        const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`;
        
        // Search Zoho CRM for Accounts assigned to this user
        const searchRes = await fetch(`${baseUrl}/search?criteria=(Owner.id:equals:${user.zohoId})`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const zohoAccounts = searchData.data || [];
          
          if (zohoAccounts.length > 0) {
            console.log(`Found ${zohoAccounts.length} live accounts from Zoho for user ${user.email}`);
            
            // Upsert each account in chunks of 30 to avoid timeouts
            await processInChunks(zohoAccounts, 30, async (record) => {
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

              await prisma.account.upsert({
                where: { zohoId: record.id },
                update: {
                  name: record.Account_Name || record.name || 'Unnamed Account',
                  industry: record.Industry || 'Unknown',
                  tags: tagsStr,
                  status: status,
                  lastPurchaseAt: lastPurchaseDate,
                  ownerId: user.id,
                },
                create: {
                  zohoId: record.id,
                  name: record.Account_Name || record.name || 'Unnamed Account',
                  industry: record.Industry || 'Unknown',
                  tags: tagsStr,
                  status: status,
                  lastPurchaseAt: lastPurchaseDate,
                  ownerId: user.id,
                }
              })
            });

            // Cache the newly synced account IDs in a local Map to prevent redundant DB reads
            const localAccounts = await prisma.account.findMany({
              where: { ownerId: user.id },
              select: { id: true, zohoId: true }
            });
            const accountMap = new Map(localAccounts.map(a => [a.zohoId, a.id]));

            // Sync Invoices — cap at 5 pages (500 records) to prevent unbounded API usage
            try {
              console.log(`Syncing invoices for owner ${user.zohoId}...`);
              let invoicePage = 1;
              let hasMoreInvoices = true;
              let syncedInvoicesCount = 0;
              const MAX_INVOICE_PAGES = 5;

              while (hasMoreInvoices && invoicePage <= MAX_INVOICE_PAGES) {
                const invoiceRes = await fetch(
                  `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Owner.id:equals:${user.zohoId})&page=${invoicePage}`,
                  { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                );

                if (!invoiceRes.ok) {
                  console.warn(`Zoho CustomModule5001 search failed with status ${invoiceRes.status}`);
                  break;
                }

                const invoiceData = await invoiceRes.json();
                const zohoInvoices = (invoiceData as any).data || [];
                
                if (zohoInvoices.length === 0) break;

                await processInChunks(zohoInvoices, 30, async (invRecord) => {
                  const accountZohoId = invRecord.Account_Name?.id;
                  const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null;
                  
                  let status = invRecord.Status || 'Paid';
                  const dueDate = invRecord.Due_Date ? new Date(invRecord.Due_Date) : null;
                  if (status !== 'Paid' && status !== 'Void' && dueDate && dueDate < new Date()) {
                    status = 'Overdue';
                  }

                    if (dbAccountId) {
                      await prisma.invoice.upsert({
                        where: { zohoId: invRecord.id },
                        update: {
                          amount: parseFloat(invRecord.Grand_Total || 0),
                          status: status,
                          issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
                          dueDate: dueDate,
                          items: {
                            booksInvoiceId: invRecord.Invoice_ID,
                            invoiceNumber: invRecord.Name,
                            balance: invRecord.Balance || 0,
                            profit: parseFloat(invRecord.Profit || 0),
                            deadCostTotal: parseFloat(invRecord.Dead_Cost_Total || 0)
                          }
                        },
                        create: {
                          zohoId: invRecord.id,
                          accountId: dbAccountId,
                          amount: parseFloat(invRecord.Grand_Total || 0),
                          status: status,
                          issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
                          dueDate: dueDate,
                          items: {
                            booksInvoiceId: invRecord.Invoice_ID,
                            invoiceNumber: invRecord.Name,
                            balance: invRecord.Balance || 0,
                            profit: parseFloat(invRecord.Profit || 0),
                            deadCostTotal: parseFloat(invRecord.Dead_Cost_Total || 0)
                          }
                        }
                      });
                      syncedInvoicesCount++;
                    }
                });

                hasMoreInvoices = (invoiceData as any).info?.more_records || false;
                invoicePage++;
              }
              console.log(`Synced ${syncedInvoicesCount} invoices for owner ${user.zohoId}.`);
            } catch (invError) {
              console.error("Failed to sync invoices:", invError);
            }

            // Sync Contacts — cap at 3 pages (300 records) to prevent unbounded API usage
            try {
              console.log(`Syncing contacts for owner ${user.zohoId}...`);
              let contactPage = 1;
              let hasMoreContacts = true;
              let syncedContactsCount = 0;
              const MAX_CONTACT_PAGES = 3;

              while (hasMoreContacts && contactPage <= MAX_CONTACT_PAGES) {
                const contactRes = await fetch(
                  `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=(Owner.id:equals:${user.zohoId})&page=${contactPage}`,
                  { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
                );

                if (!contactRes.ok) {
                  console.warn(`Zoho Contacts search failed with status ${contactRes.status}`);
                  break;
                }

                const contactData = await contactRes.json();
                const zohoContacts = (contactData as any).data || [];
                
                if (zohoContacts.length === 0) break;

                await processInChunks(zohoContacts, 30, async (contactRecord) => {
                  const accountZohoId = contactRecord.Account_Name?.id;
                  const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null;
                  if (dbAccountId) {
                    await prisma.contact.upsert({
                      where: { zohoId: contactRecord.id },
                      update: {
                        firstName: contactRecord.First_Name || null,
                        lastName: contactRecord.Last_Name || null,
                        email: contactRecord.Email || null,
                        phone: contactRecord.Phone || null,
                        mobilePhone: contactRecord.Mobile || null,
                      },
                      create: {
                        zohoId: contactRecord.id,
                        accountId: dbAccountId,
                        firstName: contactRecord.First_Name || null,
                        lastName: contactRecord.Last_Name || null,
                        email: contactRecord.Email || null,
                        phone: contactRecord.Phone || null,
                        mobilePhone: contactRecord.Mobile || null,
                      }
                    });
                    syncedContactsCount++;
                  }
                });

                hasMoreContacts = (contactData as any).info?.more_records || false;
                contactPage++;
              }
              console.log(`Synced ${syncedContactsCount} contacts for owner ${user.zohoId}.`);
            } catch (contactError) {
              console.error("Failed to sync contacts:", contactError);
            }
          }
        } else {
          console.warn(`Zoho CRM API responded with status ${searchRes.status} ${searchRes.statusText}`);
          const text = await searchRes.text();
          console.warn(`Zoho CRM API Error body: ${text}`);
        }
      } catch (zohoError) {
        console.error("Failed to sync with live Zoho CRM:", zohoError);
      }
    }

    const isAdmin = user.role?.toLowerCase().includes("admin") || user.role === "Administrator";

    // Calculate where filter based on admin role and ownerIdFilter parameter
    let whereClause: any = { ownerId: user.id };
    if (isAdmin) {
      if (ownerIdFilter === "all") {
        whereClause = {};
      } else if (ownerIdFilter) {
        whereClause = { ownerId: ownerIdFilter };
      } else {
        whereClause = { ownerId: user.id };
      }
    }

    // 4. Fetch the newly synced accounts from the local DB
    const accounts = await prisma.account.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
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
        invoices: {
          select: {
            id: true,
            amount: true,
            status: true,
            dueDate: true,
            items: true,
          }
        },
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            mobilePhone: true,
            isPrimary: true,
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          }
        }
      }
    })

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
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, accounts, reps })
    }

  } catch (error: any) {
    console.error("Get Accounts Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
