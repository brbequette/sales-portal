const { PrismaClient } = require("@prisma/client")
require("dotenv").config()

const prisma = new PrismaClient()

const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ZOHO_ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

async function getZohoAccessToken() {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'zoho_token_cache' } })
    if (row) {
      const cached = JSON.parse(row.value)
      if (cached.token && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
        console.log("Using cached token from system settings.")
        return cached.token
      }
    }
  } catch (e) {
    console.warn("DB cache read failed:", e.message)
  }

  console.log("Refreshing Zoho OAuth access token...")
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id:     process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type:    'refresh_token',
  })

  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  }

  const tokenVal  = data.access_token
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000

  try {
    await prisma.systemSetting.upsert({
      where:  { key: 'zoho_token_cache' },
      update: { value: JSON.stringify({ token: tokenVal, expiresAt }) },
      create: { key: 'zoho_token_cache', value: JSON.stringify({ token: tokenVal, expiresAt }) },
    })
  } catch (dbErr) {
    console.warn("DB cache write failed:", dbErr.message)
  }

  return tokenVal
}

async function fetchAllZohoItems(token) {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/items`
  const orgId = ZOHO_ORGANIZATION_ID
  
  console.log("Fetching first page of Zoho items...")
  const firstRes = await fetch(`${baseUrl}?organization_id=${orgId}&page=1&per_page=200`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  })
  
  if (!firstRes.ok) {
    throw new Error(`Failed to fetch items from Zoho: ${firstRes.statusText}`)
  }
  
  const firstData = await firstRes.json()
  const items = firstData.items || []
  
  const pageContext = firstData.page_context || {}
  const totalItems = pageContext.total || 0
  const perPage = pageContext.per_page || 200
  const totalPages = Math.ceil(totalItems / perPage)
  
  console.log(`Total Zoho Items: ${totalItems}, Total Pages: ${totalPages}`)
  
  if (totalPages > 1) {
    console.log(`Fetching remaining ${totalPages - 1} pages in parallel...`)
    const promises = []
    for (let page = 2; page <= totalPages; page++) {
      promises.push(
        fetch(`${baseUrl}?organization_id=${orgId}&page=${page}&per_page=200`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        }).then(async r => {
          if (!r.ok) return []
          const d = await r.json()
          return d.items || []
        }).catch((e) => {
          console.error(`Page ${page} fetch error:`, e.message)
          return []
        })
      )
    }
    const results = await Promise.all(promises)
    for (const r of results) {
      items.push(...r)
    }
  }
  
  return items
}

async function main() {
  const token = await getZohoAccessToken()
  const zohoItems = await fetchAllZohoItems(token)
  
  console.log(`Successfully fetched ${zohoItems.length} items from Zoho Books.`)

  console.log("Loading products from local database...")
  const dbProducts = await prisma.product.findMany()
  const productMap = new Map(dbProducts.map(p => [p.sku.toUpperCase(), p]))
  console.log(`Loaded ${dbProducts.length} products from database.`)

  const updateOps = []
  const createOps = []
  let skipCount = 0

  for (const item of zohoItems) {
    const sku = (item.sku || '').trim()
    if (!sku) continue
    const skuUpper = sku.toUpperCase()

    const name = item.name || ''
    const price = item.rate || 0
    const stock = item.stock_on_hand || 0
    const manufacturer = item.manufacturer || ''
    const vendor = item.brand || ''

    const isInactive = item.status === 'inactive'
    const zohoStatus = isInactive ? 'inactive' : 'active'

    const existing = productMap.get(skuUpper)

    if (existing) {
      let descObj = {}
      try {
        descObj = JSON.parse(existing.description || '{}')
      } catch {
        descObj = { text: existing.description || '' }
      }

      // Merge Zoho properties
      descObj.itemId = item.item_id
      descObj.status = zohoStatus
      if (item.description) descObj.text = item.description

      const newDesc = JSON.stringify(descObj)
      const hasDiff =
        existing.name !== name ||
        Math.abs(existing.price - price) > 0.01 ||
        existing.stock !== stock ||
        existing.manufacturer !== manufacturer ||
        existing.vendor !== vendor ||
        existing.description !== newDesc

      if (hasDiff) {
        updateOps.push(
          prisma.product.update({
            where: { id: existing.id },
            data: {
              name,
              price,
              stock,
              manufacturer,
              vendor,
              description: newDesc,
            },
          })
        )
      } else {
        skipCount++
      }
    } else {
      const descObj = {
        itemId: item.item_id,
        status: zohoStatus,
        text: item.description || '',
      }

      createOps.push({
        sku,
        name,
        price,
        stock,
        manufacturer,
        vendor,
        description: JSON.stringify(descObj),
        category: 'General',
      })
    }
  }

  console.log(`Ready to update ${updateOps.length} products and create ${createOps.length} products. Skipping ${skipCount} unchanged products.`)

  // Execute database updates in batches of 100
  let updatedCount = 0
  for (let i = 0; i < updateOps.length; i += 100) {
    const chunk = updateOps.slice(i, i + 100)
    await prisma.$transaction(chunk)
    updatedCount += chunk.length
    console.log(`Updated ${updatedCount}/${updateOps.length} products...`)
  }

  // Execute database creations
  let createdCount = 0
  if (createOps.length > 0) {
    console.log("Writing new products to database...")
    const res = await prisma.product.createMany({
      data: createOps,
      skipDuplicates: true,
    })
    createdCount = res.count
  }

  console.log(`Sync complete! Created ${createdCount} new products, updated ${updatedCount} existing products, and skipped ${skipCount} unchanged products.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
