import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from '../../../../../../netlify/functions/lib/zoho-auth'

async function fetchWithRetry(url: string, headers: HeadersInit, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers })
      if (res.status === 429) {
        console.warn(`Zoho API rate limited (429). Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        delay *= 2
        continue
      }
      if (!res.ok) {
        throw new Error(`HTTP status ${res.status}: ${res.statusText}`)
      }
      return await res.json()
    } catch (e: any) {
      if (i === retries - 1) throw e
      console.warn(`Fetch failed: ${e.message}. Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 2
    }
  }
}

async function fetchAllZohoItems(token: string) {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/items`
  const orgId = ZOHO_ORGANIZATION_ID
  
  const firstData = await fetchWithRetry(
    `${baseUrl}?organization_id=${orgId}&page=1&per_page=200&filter_by=Status.All`,
    { Authorization: `Zoho-oauthtoken ${token}` }
  )
  
  const items = firstData.items || []
  
  const pageContext = firstData.page_context || {}
  let hasMore = pageContext.has_more_page || false
  let page = 2
  
  while (hasMore) {
    try {
      const data = await fetchWithRetry(
        `${baseUrl}?organization_id=${orgId}&page=${page}&per_page=200&filter_by=Status.All`,
        { Authorization: `Zoho-oauthtoken ${token}` }
      )
      if (data.items && data.items.length > 0) {
        items.push(...data.items)
        hasMore = data.page_context?.has_more_page || false
        page++
      } else {
        hasMore = false
      }
    } catch (err: any) {
      console.error(`Failed to fetch page ${page} after retries:`, err.message)
      hasMore = false
    }
  }
  
  return items
}

export async function POST(req: NextRequest) {
  try {
    const token = await getZohoAccessToken()
    if (!token) {
      return NextResponse.json({ success: false, error: 'Zoho Authentication Failed' }, { status: 401 })
    }

    const zohoItems = await fetchAllZohoItems(token)
    if (!zohoItems || zohoItems.length === 0) {
      return NextResponse.json({ success: false, error: 'No items returned from Zoho' }, { status: 400 })
    }

    // Fetch all local products to map and compare
    const dbProducts = await prisma.product.findMany()
    const productMap = new Map(dbProducts.map(p => [p.sku.toUpperCase(), p]))

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
        let descObj: any = {}
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

    // Execute database updates in batches of 100
    let updatedCount = 0
    for (let i = 0; i < updateOps.length; i += 100) {
      const chunk = updateOps.slice(i, i + 100)
      await prisma.$transaction(chunk)
      updatedCount += chunk.length
    }

    // Execute database creations
    let createdCount = 0
    if (createOps.length > 0) {
      const res = await prisma.product.createMany({
        data: createOps,
        skipDuplicates: true,
      })
      createdCount = res.count
    }

    return NextResponse.json({
      success: true,
      totalZohoItems: zohoItems.length,
      created: createdCount,
      updated: updatedCount,
      unmodified: skipCount,
      message: `Sync complete. Created ${createdCount}, updated ${updatedCount}, skipped ${skipCount} unmodified items.`
    })
  } catch (error: any) {
    console.error('Zoho product sync error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
