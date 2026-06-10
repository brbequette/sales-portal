const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

// Ben's details for testing
const OWNER_ZOHO_ID = '6821836000000565001'; 
const USER_EMAIL = 'ben@titandiamond.net';

async function processInChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map(fn));
  }
}

async function getZohoAccessToken() {
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
    return data.access_token;
  }
  throw new Error('Failed to refresh token: ' + JSON.stringify(data));
}

async function main() {
  try {
    console.log("Acquiring access token...");
    const token = await getZohoAccessToken();
    console.log("Token acquired!");

    // Find or create local testing user
    let user = await prisma.user.findUnique({ where: { zohoId: OWNER_ZOHO_ID } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: USER_EMAIL,
          zohoId: OWNER_ZOHO_ID,
          name: "RICHARD GRIFFIN",
          role: "Sales Representative"
        }
      });
    }

    // 1. Sync Accounts
    console.log("Fetching accounts from Zoho CRM...");
    const accountUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/search?criteria=(Owner.id:equals:${OWNER_ZOHO_ID})`;
    const accountRes = await fetch(accountUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    if (!accountRes.ok) {
      throw new Error(`Failed to fetch accounts: ${accountRes.statusText}`);
    }

    const accountData = await accountRes.json();
    const zohoAccounts = accountData.data || [];
    console.log(`Found ${zohoAccounts.length} accounts from Zoho CRM.`);

    if (zohoAccounts.length > 0) {
      console.log("Upserting accounts in parallel chunks of 30...");
      await processInChunks(zohoAccounts, 30, async (record) => {
        let status = 'Open';
        const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null;
        if (lastPurchaseDate) {
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
          status = lastPurchaseDate < twelveMonthsAgo ? 'Update Status' : 'Personal';
        }
        const tagsStr = Array.isArray(record.Tag)
          ? record.Tag.map(t => t.name).filter(Boolean).join(', ')
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
        });
      });
    }

    // Cache the accounts list
    const localAccounts = await prisma.account.findMany({
      where: { ownerId: user.id },
      select: { id: true, zohoId: true }
    });
    const accountMap = new Map(localAccounts.map(a => [a.zohoId, a.id]));
    console.log(`Local account ID cache populated with ${accountMap.size} records.`);

    // 2. Sync Invoices (CustomModule5001)
    console.log("\nFetching and syncing invoices from Zoho CRM...");
    let invoicePage = 1;
    let hasMoreInvoices = true;
    let syncedInvoicesCount = 0;

    while (hasMoreInvoices) {
      const invoiceUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Owner.id:equals:${OWNER_ZOHO_ID})&page=${invoicePage}`;
      const invoiceRes = await fetch(invoiceUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });

      if (!invoiceRes.ok) {
        console.warn(`Zoho Invoices search failed: ${invoiceRes.statusText}`);
        break;
      }

      const invoiceData = await invoiceRes.json();
      const zohoInvoices = invoiceData.data || [];
      if (zohoInvoices.length === 0) break;

      console.log(`Page ${invoicePage}: Processing ${zohoInvoices.length} invoices...`);
      await processInChunks(zohoInvoices, 30, async (invRecord) => {
        const accountZohoId = invRecord.Account_Name?.id;
        const dbAccountId = accountZohoId ? accountMap.get(accountZohoId) : null;
        if (dbAccountId) {
          await prisma.invoice.upsert({
            where: { zohoId: invRecord.id },
            update: {
              amount: parseFloat(invRecord.Sub_Total || 0),
              status: invRecord.Status || 'Paid',
              issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
              dueDate: invRecord.Due_Date ? new Date(invRecord.Due_Date) : null,
              items: {
                booksInvoiceId: invRecord.Invoice_ID,
                invoiceNumber: invRecord.Name,
                balance: invRecord.Balance || 0
              }
            },
            create: {
              zohoId: invRecord.id,
              accountId: dbAccountId,
              amount: parseFloat(invRecord.Sub_Total || 0),
              status: invRecord.Status || 'Paid',
              issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
              dueDate: invRecord.Due_Date ? new Date(invRecord.Due_Date) : null,
              items: {
                booksInvoiceId: invRecord.Invoice_ID,
                invoiceNumber: invRecord.Name,
                balance: invRecord.Balance || 0
              }
            }
          });
          syncedInvoicesCount++;
        }
      });

      hasMoreInvoices = invoiceData.info?.more_records || false;
      invoicePage++;
    }
    console.log(`Successfully synced ${syncedInvoicesCount} invoices.`);

    // 3. Sync Contacts
    console.log("\nFetching and syncing contacts from Zoho CRM...");
    let contactPage = 1;
    let hasMoreContacts = true;
    let syncedContactsCount = 0;

    while (hasMoreContacts) {
      const contactUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=(Owner.id:equals:${OWNER_ZOHO_ID})&page=${contactPage}`;
      const contactRes = await fetch(contactUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });

      if (!contactRes.ok) {
        console.warn(`Zoho Contacts search failed: ${contactRes.statusText}`);
        break;
      }

      const contactData = await contactRes.json();
      const zohoContacts = contactData.data || [];
      if (zohoContacts.length === 0) break;

      console.log(`Page ${contactPage}: Processing ${zohoContacts.length} contacts...`);
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

      hasMoreContacts = contactData.info?.more_records || false;
      contactPage++;
    }
    console.log(`Successfully synced ${syncedContactsCount} contacts.`);

    console.log("\nSync process completed successfully!");

  } catch (err) {
    console.error("Sync run error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
