const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fileContent = fs.readFileSync('C:/Users/titan/Documents/Titan Diamond/deals/Contacts.csv', 'utf8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Found ${records.length} contacts in CSV.`);

  let successCount = 0;
  let skipCount = 0;

  for (const record of records) {
    try {
      const contactId = record['Contact ID'] || record['Primary Contact ID'];
      if (!contactId) {
        skipCount++;
        continue;
      }

      const firstName = record['First Name'] || '';
      const lastName = record['Last Name'] || '';
      const email = record['EmailID'] || '';
      const phone = record['Phone'] || '';
      const mobilePhone = record['MobilePhone'] || '';
      const companyName = record['Company Name'];

      if (!companyName) {
        skipCount++;
        continue;
      }

      // Find the account by name
      let account = await prisma.account.findFirst({
        where: { name: companyName }
      });

      // If account doesn't exist, create a stub account so we don't lose the contact
      if (!account) {
        // Fallback: need an owner. Find any user.
        let user = await prisma.user.findFirst();
        if (!user) {
          user = await prisma.user.create({
            data: { email: 'admin@titandiamond.net', name: 'Admin', role: 'ADMIN' }
          });
        }

        account = await prisma.account.create({
          data: {
            zohoId: `stub_${contactId}`,
            name: companyName,
            status: "Update Status",
            ownerId: user.id
          }
        });
      }

      await prisma.contact.upsert({
        where: { zohoId: contactId },
        update: {
          firstName,
          lastName,
          email,
          phone,
          mobilePhone,
          accountId: account.id
        },
        create: {
          zohoId: contactId,
          firstName,
          lastName,
          email,
          phone,
          mobilePhone,
          accountId: account.id,
          isPrimary: true
        }
      });
      successCount++;
    } catch (e) {
      console.error(`Error processing contact ${record['Contact ID']}:`, e.message);
    }
  }

  console.log(`Finished. Upserted ${successCount} contacts, skipped ${skipCount}.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
