const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simplified mapping of first 3 digits of ZIP to Timezone
function getTimezoneByZip(zip) {
  if (!zip) return null;
  const match = zip.match(/\d{5}/);
  if (!match) return null;
  const prefix = parseInt(match[0].substring(0, 3), 10);

  if (prefix >= 0 && prefix <= 349) return 'EST'; // Northeast, East Coast
  if (prefix >= 430 && prefix <= 499) return 'EST'; // OH, MI, IN (mostly EST)
  if (prefix >= 350 && prefix <= 427) return 'CST'; // AL, TN, KY
  if (prefix >= 500 && prefix <= 589) return 'CST'; // IA, WI, MN, SD, ND
  if (prefix >= 600 && prefix <= 689) return 'CST'; // IL, MO, KS, NE
  if (prefix >= 700 && prefix <= 789) return 'CST'; // LA, AR, OK, TX (most)
  
  if (prefix >= 590 && prefix <= 599) return 'MST'; // MT
  if (prefix >= 690 && prefix <= 693) return 'MST'; // NE (west)
  if (prefix >= 790 && prefix <= 799) return 'MST'; // TX (west)
  if (prefix >= 800 && prefix <= 849) return 'MST'; // CO, WY, ID, UT
  if (prefix >= 850 && prefix <= 884) return 'MST'; // AZ, NM
  
  if (prefix >= 889 && prefix <= 899) return 'PST'; // NV
  if (prefix >= 900 && prefix <= 961) return 'PST'; // CA
  if (prefix >= 970 && prefix <= 994) return 'PST'; // OR, WA
  
  if (prefix >= 995 && prefix <= 999) return 'AST'; // AK
  if (prefix === 967 || prefix === 968) return 'HST'; // HI
  
  return null;
}

async function getZohoToken() {
  const tokenSetting = await prisma.systemSetting.findUnique({
    where: { key: 'zoho_access_token' }
  });
  if (tokenSetting && tokenSetting.value) return tokenSetting.value;

  const authData = await prisma.user.findFirst({
    where: { email: { contains: "dummy.titandiamond.com" } }
  });
  if (authData && authData.zohoAuthData) {
    return JSON.parse(authData.zohoAuthData).access_token;
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

async function main() {
  const token = await getZohoToken();
  if (!token) {
    console.error("No Zoho token available.");
    return;
  }

  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';
  const ZOHO_DC = process.env.ZOHO_DC || 'com';

  const dbAccounts = await prisma.account.findMany({
    select: { id: true, zohoId: true, timeZone: true }
  });

  let page = 1;
  let hasMore = true;
  const crmAccountsMap = new Map();

  console.log("Fetching accounts from Zoho CRM...");
  while (hasMore) {
    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?fields=id,Billing_Code&per_page=200&page=${page}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const data = await res.json();
    
    if (data.code || !data.data || data.data.length === 0) break;
    
    data.data.forEach(acc => {
      crmAccountsMap.set(acc.id, acc.Billing_Code);
    });
    
    hasMore = data.info?.more_records || false;
    page++;
  }

  const updateOps = [];
  let updatedCount = 0;

  for (const dbAcc of dbAccounts) {
    const zipCode = crmAccountsMap.get(dbAcc.zohoId);
    let calculatedTz = getTimezoneByZip(zipCode);
    
    if (calculatedTz && dbAcc.timeZone !== calculatedTz) {
      updateOps.push(
        prisma.account.update({
          where: { id: dbAcc.id },
          data: { timeZone: calculatedTz }
        })
      );
      updatedCount++;
    }
  }

  if (updateOps.length > 0) {
    for (let i = 0; i < updateOps.length; i += 50) {
      await prisma.$transaction(updateOps.slice(i, i + 50));
    }
  }

  console.log(`Successfully backfilled timezone from ZIP code for ${updatedCount} of ${dbAccounts.length} accounts.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
