import { Handler } from '@netlify/functions'
import { prisma } from './lib/prisma'

const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

let _cachedToken: string | null = null
let _tokenExpiresAt = 0

async function getToken(): Promise<string> {
  const now = Date.now()

  // 1. In-memory cache
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken
  }

  // 2. Database SystemSettings cache
  try {
    const [dbTokenSetting, dbExpiresSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } }),
      prisma.systemSetting.findUnique({ where: { key: 'zoho_token_expires_at' } })
    ])

    if (dbTokenSetting && dbExpiresSetting) {
      const expiresAt = parseInt(dbExpiresSetting.value, 10)
      if (!isNaN(expiresAt) && now < expiresAt - 5 * 60 * 1000) {
        _cachedToken = dbTokenSetting.value
        _tokenExpiresAt = expiresAt
        return _cachedToken
      }
    }
  } catch (e: any) {
    console.warn('Database token cache read error:', e.message)
  }

  // 3. OAuth refresh flow
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    const params = new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token',
    })

    const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    const data = await res.json()
    if (data.access_token) {
      _cachedToken = data.access_token
      _tokenExpiresAt = now + (data.expires_in || 3600) * 1000

      // Update SystemSettings in DB
      try {
        await Promise.all([
          prisma.systemSetting.upsert({
            where: { key: 'zoho_access_token' },
            update: { value: _cachedToken },
            create: { key: 'zoho_access_token', value: _cachedToken }
          }),
          prisma.systemSetting.upsert({
            where: { key: 'zoho_token_expires_at' },
            update: { value: String(_tokenExpiresAt) },
            create: { key: 'zoho_token_expires_at', value: String(_tokenExpiresAt) }
          })
        ])
      } catch (e) {}

      return _cachedToken
    } else {
      throw new Error(`Zoho OAuth refresh failed: ${data.error || 'Unknown error'}`)
    }
  }

  throw new Error('Zoho credentials missing in environment variables (ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET).')
}

async function fetchAllPages(baseUrl: string, token: string, endpoint: string): Promise<any[]> {
  let all: any[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${baseUrl}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Zoho auth failed (${res.status}) -- token may be expired.`)
      }
      if (res.status === 429) {
        throw new Error(`Zoho rate limit hit -- wait a minute and try again.`)
      }
      throw new Error(`Zoho API returned ${res.status} for ${endpoint}`)
    }

    const rawText = await res.text()
    if (rawText.trim().startsWith('<')) {
      throw new Error(`Zoho returned HTML instead of JSON for ${endpoint}.`)
    }

    let data: any
    try { data = JSON.parse(rawText) } catch {
      throw new Error(`Invalid JSON from Zoho for ${endpoint}: ${rawText.substring(0, 80)}`)
    }

    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`Zoho API error on ${endpoint}: ${data.message}`)
    }

    const items = data[endpoint] || []
    all = all.concat(items)

    hasMore = data.page_context?.has_more_page || false
    page++
    if (page > 5) break
  }

  return all
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const token = await getToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Sync Packages
    const allPackages = await fetchAllPages(baseUrl, token, 'packages')
    let pkgCreated = 0, pkgUpdated = 0, pkgErrors = 0

    for (const pkg of allPackages) {
      try {
        const zohoId = pkg.package_id
        if (!zohoId) continue

        const packageData: any = {
          zohoId,
          packageNumber: pkg.package_number || null,
          salesOrderId: pkg.salesorder_id || null,
          salesOrderNumber: pkg.salesorder_number || null,
          date: pkg.date ? new Date(pkg.date) : null,
          status: pkg.status || null,
          carrier: pkg.delivery_method || pkg.shipping_carrier || null,
          trackingNumber: pkg.tracking_number || null,
          shippingCharge: pkg.shipping_charge || 0,
          items: pkg.line_items ? { lineItems: pkg.line_items } : null,
        }

        const existing = await prisma.package.findUnique({ where: { zohoId } })
        if (existing) {
          await prisma.package.update({ where: { zohoId }, data: packageData })
          pkgUpdated++
        } else {
          await prisma.package.create({ data: packageData })
          pkgCreated++
        }
      } catch { pkgErrors++ }
    }

    // Sync Purchase Orders (Dropshipments)
    const allPOs = await fetchAllPages(baseUrl, token, 'purchaseorders')
    let poCreated = 0, poUpdated = 0, poErrors = 0, dropshipCount = 0

    for (const po of allPOs) {
      try {
        const zohoId = po.purchaseorder_id
        if (!zohoId) continue

        const isDropshipment = !!(po.delivery_customer_id || po.salesorder_id)
        if (isDropshipment) dropshipCount++

        // Try to automatically find and tie to an invoice via SalesOrder number
        let invoiceId = null
        let invoiceNumber = null
        const salesOrderNumber = po.salesorder_number || null
        if (salesOrderNumber) {
          const inv = await prisma.invoice.findFirst({
            where: {
              items: { path: ['salesOrderNumber'], equals: salesOrderNumber }
            },
            select: { zohoId: true, items: true }
          })
          if (inv) {
            invoiceId = inv.zohoId
            invoiceNumber = (inv.items as any)?.invoiceNumber || null
          }
        }

        const poData: any = {
          zohoId,
          vendorName: po.vendor_name || null,
          date: po.date ? new Date(po.date) : null,
          total: po.total || 0,
          status: po.status || null,
          salesOrderId: po.salesorder_id || null,
          salesOrderNumber,
          isDropshipment,
          trackingNumber: po.tracking_number || null,
          items: po.line_items ? { lineItems: po.line_items } : null,
          invoiceId,
          invoiceNumber,
        }

        const existing = await prisma.purchaseOrder.findUnique({ where: { zohoId } })
        if (existing) {
          await prisma.purchaseOrder.update({ where: { zohoId }, data: poData })
          poUpdated++
        } else {
          await prisma.purchaseOrder.create({ data: poData })
          poCreated++
        }
      } catch (err: any) { poErrors++ }
    }

    // Sync Customer Payments
    const allPayments = await fetchAllPages(baseUrl, token, 'customerpayments')
    let payCreated = 0, payUpdated = 0, payErrors = 0

    for (const pay of allPayments) {
      try {
        const zohoId = pay.payment_id
        if (!zohoId) continue

        const invNum = (pay.invoice_numbers || '').split(',')[0].trim() || null
        let invoiceId = null
        if (invNum) {
          const inv = await prisma.invoice.findFirst({
            where: {
              OR: [
                { zohoId: invNum },
                { items: { path: ['invoiceNumber'], equals: invNum } }
              ]
            },
            select: { zohoId: true }
          })
          if (inv) {
            invoiceId = inv.zohoId
          }
        }

        const paymentData = {
          zohoId,
          amount: parseFloat(pay.amount || 0),
          date: pay.date ? new Date(pay.date) : null,
          mode: pay.payment_mode || null,
          status: pay.payment_status || pay.status || null,
          referenceNumber: pay.reference_number || null,
          bankCharges: parseFloat(pay.bank_charges || 0),
          invoiceId,
          invoiceNumber: invNum,
        }

        const existing = await prisma.payment.findUnique({ where: { zohoId } })
        if (existing) {
          await prisma.payment.update({ where: { zohoId }, data: paymentData })
          payUpdated++
        } else {
          await prisma.payment.create({ data: paymentData })
          payCreated++
        }
      } catch (err: any) {
        payErrors++
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        packages: { total: allPackages.length, created: pkgCreated, updated: pkgUpdated, errors: pkgErrors },
        purchaseOrders: { total: allPOs.length, dropshipments: dropshipCount, created: poCreated, updated: poUpdated, errors: poErrors },
        payments: { total: allPayments.length, created: payCreated, updated: payUpdated, errors: payErrors },
        message: `Synced ${allPackages.length} packages (${pkgCreated} new), ${allPOs.length} POs (${dropshipCount} dropshipments, ${poCreated} new), and ${allPayments.length} payments (${payCreated} new).`,
      })
    }
  } catch (err: any) {
    console.error('sync-packages error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
