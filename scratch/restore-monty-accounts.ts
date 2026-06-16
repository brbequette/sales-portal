const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const montyId = "cmppb3de4000013bxtcprpvww"
  const montyZohoId = "6821836000000617001"

  console.log(`Starting restoration for Montgomery Morgan (Local ID: ${montyId}, Zoho ID: ${montyZohoId})...`)

  const { getZohoAccessToken } = require("../netlify/functions/lib/zoho-auth.ts")
  const token = await getZohoAccessToken()

  const ZOHO_DC = process.env.ZOHO_DC || "com"
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts`;
          
  let page = 1;
  let zohoAccounts: any[] = [];
  let hasMore = true;

  console.log(`Fetching all accounts assigned to Montgomery Morgan from Zoho CRM...`)

  while (hasMore) {
    const searchRes = await fetch(`${baseUrl}/search?criteria=(Owner.id:equals:${montyZohoId})&page=${page}&per_page=200`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const pageRecords = searchData.data || [];
      zohoAccounts = [...zohoAccounts, ...pageRecords];
      console.log(`Fetched page ${page}: ${pageRecords.length} records. Total so far: ${zohoAccounts.length}`)
      
      if (searchData.info && searchData.info.more_records) {
        page++;
      } else {
        hasMore = false;
      }
    } else {
      console.error(`Failed to fetch page ${page}. Status: ${searchRes.status}`)
      hasMore = false;
    }
  }

  console.log(`Found ${zohoAccounts.length} total accounts in Zoho CRM assigned to Montgomery Morgan.`)

  if (zohoAccounts.length === 0) {
    console.log("No accounts found. Exiting.")
    return
  }

  const zohoIdsToRestore = zohoAccounts.map(a => a.id)

  console.log(`Reassigning ${zohoIdsToRestore.length} accounts to Montgomery in local database...`)

  // Update in local DB
  const updateResult = await prisma.account.updateMany({
    where: {
      zohoId: { in: zohoIdsToRestore }
    },
    data: {
      ownerId: montyId
    }
  })

  console.log(`Success! Restored ${updateResult.count} accounts to Montgomery Morgan locally.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
