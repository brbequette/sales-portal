const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ZOHO_DC = process.env.ZOHO_DC || 'com';

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

async function syncUser(user, token) {
  console.log(`\n======================================`);
  console.log(`Syncing for user: ${user.name} (${user.email})`);
  console.log(`======================================`);

  if (!user.zohoId || user.zohoId.startsWith('mock-zoho')) {
    console.log("Skipping mock user.");
    return;
  }

  // Cache the accounts list for this user
  const localAccounts = await prisma.account.findMany({
    where: { ownerId: user.id },
    select: { id: true, zohoId: true }
  });
  const accountMap = new Map(localAccounts.map(a => [a.zohoId, a.id]));
  console.log(`Loaded account map with ${accountMap.size} records.`);

  // 1. Sync Invoices (CustomModule5001)
  console.log("Fetching and syncing invoices from Zoho CRM...");
  let invoicePage = 1;
  let hasMoreInvoices = true;
  let syncedInvoicesCount = 0;
  const now = new Date();

  while (hasMoreInvoices) {
    const invoiceUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Owner.id:equals:${user.zohoId})&page=${invoicePage}`;
    const invoiceRes = await fetch(invoiceUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    if (!invoiceRes.ok) {
      console.warn(`Zoho Invoices search failed with status ${invoiceRes.status}`);
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
        // Compute dynamically if the invoice is Overdue
        let status = invRecord.Status || 'Paid';
        const dueDate = invRecord.Due_Date ? new Date(invRecord.Due_Date) : null;
        if (status !== 'Paid' && status !== 'Void' && dueDate && dueDate < now) {
          status = 'Overdue';
        }

        await prisma.invoice.upsert({
          where: { zohoId: invRecord.id },
          update: {
            amount: parseFloat(invRecord.Sub_Total || 0),
            status: status,
            issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
            dueDate: dueDate,
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
            status: status,
            issueDate: new Date(invRecord.Invoice_Date || invRecord.Created_Time),
            dueDate: dueDate,
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

  // 2. Sync Contacts
  console.log("Fetching and syncing contacts from Zoho CRM...");
  let contactPage = 1;
  let hasMoreContacts = true;
  let syncedContactsCount = 0;

  while (hasMoreContacts) {
    const contactUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts/search?criteria=(Owner.id:equals:${user.zohoId})&page=${contactPage}`;
    const contactRes = await fetch(contactUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    if (!contactRes.ok) {
      console.warn(`Zoho Contacts search failed with status ${contactRes.status}`);
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
}

async function main() {
  try {
    console.log("Acquiring token...");
    const token = await getZohoAccessToken();
    console.log("Token acquired!");

    const users = await prisma.user.findMany();
    for (const user of users) {
      await syncUser(user, token);
    }

    console.log("\n======================================");
    console.log("All users synced successfully!");
    console.log("======================================");

  } catch (err) {
    console.error("Global sync error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
