export type DropshipProductEvidence = {
  sku: string
  vendor: string | null
  canDropship: boolean | null
  costQuality: string
  unitCost: number | null
}

export function isPioneerCalifornia(vendorName: string, destinationState: string) {
  const state = destinationState.trim().toUpperCase()
  return /\bPIONEER\b/i.test(vendorName) && (state === 'CA' || state === 'CALIFORNIA')
}

export function validateDirectDropshipEvidence(
  product: DropshipProductEvidence,
  selectedVendorId: string,
  alternateVendorIds?: (string | null | undefined)[]
) {
  const isVendorMatch = product.vendor === selectedVendorId ||
    (Array.isArray(alternateVendorIds) && product.vendor ? alternateVendorIds.includes(product.vendor) : false)
  if (!isVendorMatch) return { allowed: false, reason: `Product ${product.sku} is not mapped to the selected authoritative vendor.` }
  if (product.canDropship !== true) return { allowed: false, reason: `Product ${product.sku} is not approved for direct dropshipment.` }
  if (product.costQuality !== 'AUTHORITATIVE' || !(Number(product.unitCost) > 0)) {
    return { allowed: false, reason: `Product ${product.sku} lacks authoritative positive cost.` }
  }
  return { allowed: true, unitCost: Number(product.unitCost) }
}
