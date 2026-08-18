const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fileContent = fs.readFileSync('C:/Users/titan/Documents/Titan Diamond/deals/Deals_2026_05_28.csv', 'utf8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Found ${records.length} deals in CSV.`);

  let successCount = 0;
  let skipCount = 0;

  for (const record of records) {
    try {
      // CSV Headers
      // Record Id, Deal Owner.id, Amount, Deal Name, Closing Date, Account Name.id, Stage, Invoiced Items
      
      let accountIdRaw = record['Account Name.id'];
      if (!accountIdRaw) {
        console.log(`Skipping deal ${record['Record Id']} because it has no Account.`);
        skipCount++;
        continue;
      }
      // Strip zcrm_ prefix from Zoho CRM IDs
      const cleanAccountId = accountIdRaw.replace('zcrm_', '');
      const dealZohoId = record['Record Id'].replace('zcrm_', '');
      const ownerZohoId = record['Deal Owner.id'].replace('zcrm_', '');

      // 1. Ensure User exists (fallback)
      let owner = await prisma.user.findUnique({ where: { zohoId: ownerZohoId } });
      if (!owner) {
        owner = await prisma.user.create({
          data: {
            zohoId: ownerZohoId,
            name: record['Deal Owner'] || 'Unknown Owner',
            email: `${ownerZohoId}@dummy.titandiamond.net`,
            role: 'Sales Representative'
          }
        });
      }

      // 2. Ensure Account exists (if not, we create a stub)
      let account = await prisma.account.findUnique({ where: { zohoId: cleanAccountId } });
      if (!account) {
        account = await prisma.account.create({
          data: {
            zohoId: cleanAccountId,
            name: record['Account Name'] || 'Unknown Account',
            ownerId: owner.id,
            status: 'Open'
          }
        });
      }

      // 3. Upsert Deal
      const amount = parseFloat(record['Amount'] || '0') || 0;
      let closingDate = null;
      if (record['Closing Date']) {
        closingDate = new Date(record['Closing Date']);
      }

      await prisma.deal.upsert({
        where: { zohoId: dealZohoId },
        update: {
          name: record['Deal Name'],
          amount: amount,
          stage: record['Stage'] || 'Open',
          closingDate: closingDate,
          invoicedItems: record['Invoiced Items'] || null,
          accountId: account.id,
          ownerId: owner.id
        },
        create: {
          zohoId: dealZohoId,
          name: record['Deal Name'] || 'Unknown Deal',
          amount: amount,
          stage: record['Stage'] || 'Open',
          closingDate: closingDate,
          invoicedItems: record['Invoiced Items'] || null,
          accountId: account.id,
          ownerId: owner.id
        }
      });
      successCount++;
    } catch (e) {
      console.error(`Error processing deal ${record['Record Id']}:`, e.message);
    }
  }

  console.log(`Finished. Upserted ${successCount} deals, skipped ${skipCount}.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
