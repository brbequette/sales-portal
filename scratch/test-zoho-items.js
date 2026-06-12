const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } })
  const token = tokenSetting.value
  const ORG_ID = "664670946" // Correct ID
  const ZOHO_DC = "com"

  const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ORG_ID}&per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  const data = await res.json()
  console.log(JSON.stringify(data.items, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
