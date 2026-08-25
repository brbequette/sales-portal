export type ShippingAllocation = {
  id?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  cost?: number | string | null
  notes?: string | null
  itemSkus?: string[] | null
}

export type ShippingPackage = {
  id?: string | null
  zohoId?: string | null
  packageNumber?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  shippingCharge?: number | string | null
}

export type PriorShippingRollup = {
  total?: number | null
  unitemizedCost?: number | null
}

const money = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0
}

const keyPart = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")

export function aggregateShippingCosts(input: {
  legacyCost?: number | string | null
  legacyBreakdown?: string | null
  allocations?: ShippingAllocation[] | null
  packages?: ShippingPackage[] | null
  priorRollup?: PriorShippingRollup | null
}) {
  const packages = (input.packages || []).filter(pkg => money(pkg.shippingCharge) > 0)
  const packageTracking = new Set(packages.map(pkg => keyPart(pkg.trackingNumber)).filter(Boolean))
  const sourceKeys = new Set<string>()
  const lines: string[] = []
  let detailedTotal = 0

  for (const pkg of packages) {
    const cost = money(pkg.shippingCharge)
    const sourceKey = `package:${keyPart(pkg.zohoId || pkg.id || pkg.packageNumber || pkg.trackingNumber)}`
    if (sourceKeys.has(sourceKey)) continue
    sourceKeys.add(sourceKey)
    detailedTotal += cost
    const reference = pkg.packageNumber || pkg.zohoId || pkg.id || "Package"
    const carrier = pkg.carrier || "Shipment"
    const tracking = pkg.trackingNumber ? ` #${pkg.trackingNumber}` : ""
    lines.push(`Package ${reference} | ${carrier}${tracking} | $${cost.toFixed(2)}`)
  }

  for (const allocation of input.allocations || []) {
    const cost = money(allocation.cost)
    if (!cost) continue
    const trackingKey = keyPart(allocation.trackingNumber)
    if (trackingKey && packageTracking.has(trackingKey)) continue
    const sourceKey = `allocation:${keyPart(allocation.id || allocation.trackingNumber || `${allocation.carrier}:${cost}:${allocation.notes}`)}`
    if (sourceKeys.has(sourceKey)) continue
    sourceKeys.add(sourceKey)
    detailedTotal += cost
    const carrier = allocation.carrier || "Freight/Shipment"
    const tracking = allocation.trackingNumber ? ` #${allocation.trackingNumber}` : ""
    const items = allocation.itemSkus?.length ? ` | Covers: ${allocation.itemSkus.join(", ")}` : ""
    const notes = allocation.notes ? ` | ${allocation.notes}` : ""
    lines.push(`Manual freight | ${carrier}${tracking} | $${cost.toFixed(2)}${items}${notes}`)
  }

  const legacyCost = money(input.legacyCost)
  const previousTotal = money(input.priorRollup?.total)
  const storedUnitemized = money(input.priorRollup?.unitemizedCost)
  const unitemizedCost = input.priorRollup
    ? storedUnitemized
    : Math.max(0, Math.round((legacyCost - detailedTotal) * 100) / 100)

  if (unitemizedCost > 0) {
    detailedTotal += unitemizedCost
    lines.push(`Unitemized prior shipping | $${unitemizedCost.toFixed(2)}`)
  } else if (lines.length === 0 && legacyCost > 0) {
    detailedTotal = legacyCost
    lines.push(input.legacyBreakdown?.trim() || `Recorded shipping | $${legacyCost.toFixed(2)}`)
  }

  const total = Math.round(detailedTotal * 100) / 100
  return {
    total,
    breakdown: lines.join("\n"),
    rollup: {
      total,
      unitemizedCost,
      previousTotal,
      sourceKeys: [...sourceKeys],
      updatedAt: new Date().toISOString(),
    },
  }
}