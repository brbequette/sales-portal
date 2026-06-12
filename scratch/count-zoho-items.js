const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } })
  const token = tokenSetting.value
  const ORG_ID = "664670946"
  const ZOHO_DC = "com"

  let page = 1
  let hasMore = true
  let allItems = []

  while (hasMore) {
    console.log(`Fetching page ${page}...`)
    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ORG_ID}&page=${page}&per_page=200`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    const data = await res.json()
    if (data.code !== 0) {
      console.error(data)
      break
    }
    
    if (data.items) {
      allItems.push(...data.items)
    }
    
    hasMore = data.page_context?.has_more_page || false
    page++
  }

  console.log(`Total items fetched: ${allItems.length}`)
  const activeItems = allItems.filter(i => i.status === "active")
  console.log(`Active items: ${activeItems.length}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
