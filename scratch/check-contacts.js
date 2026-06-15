const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const contactsEmail = await p.$queryRaw`
    SELECT "accountId", "email", count(*)
    FROM "Contact"
    WHERE "email" IS NOT NULL AND "email" != ''
    GROUP BY "accountId", "email"
    HAVING count(*) > 1
  `;
  console.log('Same-account duplicate contacts by email:', contactsEmail.length);

  const contactsPhone = await p.$queryRaw`
    SELECT "accountId", "phone", count(*)
    FROM "Contact"
    WHERE "phone" IS NOT NULL AND "phone" != ''
    GROUP BY "accountId", "phone"
    HAVING count(*) > 1
  `;
  console.log('Same-account duplicate contacts by phone:', contactsPhone.length);

  process.exit(0);
}

run();
