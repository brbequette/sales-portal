import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'

const ZOHO_DC = process.env.ZOHO_DC?.trim() || 'com'
const TIMEOUT_MS = 15000
function organizationId() { return process.env.ZOHO_ORGANIZATION_ID?.trim() || '' }

export type ProductReconciliationResult = {
  state: 'SUCCEEDED' | 'FAILED'
  productId?: string
  sku: string
  costQuality?: 'AUTHORITATIVE'
  dropshipEligibility: 'AUTHORIZED' | 'BLOCKED_UNKNOWN'
  message: string
}

async function getBooks(path: string, token: string) {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3${path}${separator}organization_id=${encodeURIComponent(organizationId())}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || Number(body?.code) !== 0) throw new Error(String(body?.message || `Zoho Books lookup failed (HTTP ${response.status}).`))
  return body
}

/** Reconciles one exact local SKU to one exact Books item; it never creates or searches broadly. */
export async function reconcileExactBooksProduct(sku: string, booksItemId?: string): Promise<ProductReconciliationResult> {
  const exactSku = sku.trim()
  let exactItemId = booksItemId?.trim() || ''
  if (!organizationId()) throw new Error('ZOHO_ORGANIZATION_ID is not configured')
  const products = await prisma.product.findMany({ where: { sku: exactSku }, take: 2 })
  if (products.length !== 1) return { state: 'FAILED', sku: exactSku, dropshipEligibility: 'BLOCKED_UNKNOWN', message: 'Exactly one local product must match the requested SKU.' }

  const token = await getZohoAccessToken()
  if (!exactItemId) {
    const search = await getBooks(`/items?search_text=${encodeURIComponent(exactSku)}&per_page=25`, token)
    // Provider JSON is runtime-validated by exact identity below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exactMatches = (Array.isArray(search?.items) ? search.items : []).filter((item: any) => String(item?.sku || item?.name || '').trim() === exactSku && String(item?.item_id || '').trim())
    if (exactMatches.length !== 1) return { state: 'FAILED', sku: exactSku, dropshipEligibility: 'BLOCKED_UNKNOWN', message: 'Books did not return exactly one item with the exact SKU.' }
    exactItemId = String(exactMatches[0].item_id).trim()
  }
  const body = await getBooks(`/items/${encodeURIComponent(exactItemId)}`, token)
  const item = body?.item
  const returnedId = String(item?.item_id || '').trim()
  const returnedSku = String(item?.sku || item?.name || '').trim()
  const preferredVendorId = String(item?.preferred_vendor_id || item?.vendor_id || '').trim()
  const salesRate = Number(item?.rate)
  const purchaseRate = Number(item?.purchase_rate)
  const status = String(item?.status || '').toLowerCase()
  const itemType = String(item?.item_type || '').toLowerCase()
  const productType = String(item?.product_type || '').toLowerCase()
  // Inventory account presence is not inventory-tracking or dropship evidence.
  const inventoryTracked = item?.track_inventory === true
  if (returnedId !== exactItemId || returnedSku !== exactSku) return { state: 'FAILED', sku: exactSku, dropshipEligibility: 'BLOCKED_UNKNOWN', message: 'Books returned a different item identity.' }
  if (status !== 'active' || !Number.isFinite(salesRate) || salesRate <= 0 || !Number.isFinite(purchaseRate) || purchaseRate <= 0) {
    return { state: 'FAILED', sku: exactSku, dropshipEligibility: 'BLOCKED_UNKNOWN', message: 'Books item is not active or lacks authoritative positive sales and purchase rates.' }
  }
  if (itemType !== 'sales_and_purchases' || productType !== 'goods' || inventoryTracked || !preferredVendorId) {
    return { state: 'FAILED', sku: exactSku, dropshipEligibility: 'BLOCKED_UNKNOWN', message: 'Books item type, product type, inventory mode, or preferred vendor does not match the required facts.' }
  }

  const vendorBody = await getBooks(`/contacts/${encodeURIComponent(preferredVendorId)}`, token)
  const vendor = vendorBody?.contact
  const vendorId = String(vendor?.contact_id || '').trim()
  const vendorStatus = String(vendor?.status || '').toLowerCase()
  const vendorType = String(vendor?.contact_type || '').toLowerCase()
  if (vendorId !== preferredVendorId || vendorStatus !== 'active' || !vendorType.includes('vendor')) {
    return { state: 'FAILED', sku: exactSku, dropshipEligibility: 'BLOCKED_UNKNOWN', message: 'The exact preferred vendor was not verified as an active Books vendor.' }
  }

  // Books exposes transaction-level drop-shipment fields on purchase orders,
  // not an authoritative item eligibility flag. Preserve an audited local
  // business authorization instead of inventing or clearing provider evidence.
  const locallyAuthorizedDropship = products[0].canDropship === true
  await prisma.product.update({
    where: { id: products[0].id },
    data: {
      booksItemId: exactItemId,
      price: salesRate,
      unitCost: purchaseRate,
      costQuality: 'AUTHORITATIVE',
      vendor: preferredVendorId,
      canDropship: locallyAuthorizedDropship ? true : null,
    },
  })
  return {
    state: 'SUCCEEDED', productId: products[0].id, sku: exactSku, costQuality: 'AUTHORITATIVE',
    dropshipEligibility: locallyAuthorizedDropship ? 'AUTHORIZED' : 'BLOCKED_UNKNOWN',
    message: locallyAuthorizedDropship
      ? 'Product financials and preferred vendor reconciled; audited application-managed dropship authorization was preserved.'
      : 'Product financials and preferred vendor reconciled; dropship remains blocked pending audited application-managed business authorization.',
  }
}
