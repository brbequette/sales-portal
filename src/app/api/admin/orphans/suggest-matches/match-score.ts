import { evaluatePOReference } from '../../../../../lib/po-document-reference'
import { financialZohoLineItems } from '../../../../../lib/zoho-line-items'

export interface MatchScoreResult {
  score: number
  referenceStatus?: 'exact' | 'fuzzy' | 'conflict'
  requiresReview?: boolean
  autoWriteEligible?: boolean
  reasons: string[]
  matchDetails: {
    referenceMatch?: string | null
    addressMatch?: string | null
    itemMatch?: string | null
    dateMatch?: string | null
    amountMatch?: string | null
  }
}

export function isTitanWarehouse(str?: string | null): boolean {
  const s = String(str || '').toLowerCase()
  return (s.includes('8321') && s.includes('evans')) || s.includes('titan diamond') || s.includes('rowley')
}

export const INDUSTRY_STOP_WORDS = new Set([
  'llc', 'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited',
  'services', 'service', 'tool', 'tools', 'general', 'and', '&', 'the', 'usa',
  'road', 'street', 'drive', 'blvd', 'suite', 'unit', 'ave', 'avenue', 'north', 'south', 'east', 'west',
  'construction', 'construct', 'contracting', 'contractor', 'contractors',
  'concrete', 'cement', 'masonry', 'paving', 'pavers', 'asphalt',
  'building', 'builders', 'build', 'custom', 'design',
  'roofing', 'roof', 'landscaping', 'landscape', 'excavating', 'excavation', 'grading',
  'drilling', 'sawing', 'cutting', 'coring', 'demolition',
  'flooring', 'drywall', 'plumbing', 'electric', 'electrical', 'mechanical',
  'supply', 'supplies', 'materials', 'equipment', 'enterprises', 'solutions', 'group', 'products', 'rentals', 'rental'
])

export function tokenizeClean(str?: string | null): string[] {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !INDUSTRY_STOP_WORDS.has(t))
}

export function isCustomerMatch(
  poCustomer?: string | null,
  docCustomer?: string | null,
  poAddress?: string | null,
  docAddress?: string | null,
  contacts?: Array<{ firstName?: string | null; lastName?: string | null }> | null
): boolean {
  const poCust = String(poCustomer || '').trim().toLowerCase()
  const docCust = String(docCustomer || '').trim().toLowerCase()
  
  if (!poCust && !poAddress) return false

  // Check against registered account contacts (e.g. Jason Everard, Bob Clark, Aaron Rodarte)
  if (contacts && Array.isArray(contacts)) {
    for (const c of contacts) {
      const full = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().trim()
      const last = String(c.lastName || '').toLowerCase().trim()
      if (poCust && full.length > 2 && (poCust === full || poCust.includes(full) || full.includes(poCust))) return true
      if (last.length > 3 && (poCust === last || poCust.includes(last))) return true
    }
  }

  if (poCust && docCust) {
    if (poCust === docCust) return true
    if (poCust.includes(docCust) || docCust.includes(poCust)) return true

    const poTokens = tokenizeClean(poCust)
    const docTokens = tokenizeClean(docCust)

    if (poTokens.length > 0 && docTokens.length > 0) {
      const docTokenSet = new Set(docTokens)
      const overlap = poTokens.filter(t => docTokenSet.has(t))
      if (overlap.length >= 1) return true
    }

    // Contact/Recipient attention check (e.g. PO shipToName is contact person on customer's account/invoice)
    if (poTokens.length > 0 && docAddress) {
      const docAddrLower = String(docAddress).toLowerCase()
      const matchedCustTokens = poTokens.filter(t => docAddrLower.includes(t))
      if (matchedCustTokens.length >= (poTokens.length > 1 ? 2 : 1)) return true
    }
  }

  // Address check
  const poAddrClean = String(poAddress || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const docAddrClean = String(docAddress || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  if (poAddrClean.length > 5 && docAddrClean.length > 5) {
    const poAddrTokens = poAddrClean.split(/\s+/).filter(t => t.length > 3 && !INDUSTRY_STOP_WORDS.has(t))
    const matchedAddrTokens = poAddrTokens.filter(t => docAddrClean.includes(t))
    if (matchedAddrTokens.length >= 2) return true
  }

  return false
}

function computeSupportingScore(po: any, doc: any): MatchScoreResult {
  let score = 0
  const reasons: string[] = []
  const matchDetails: MatchScoreResult['matchDetails'] = {}

  const docItems = doc.items || {}
  const poItems = po.items || {}

  const poTotal = Number(po.total || poItems.total || 0)
  const docTotal = Number(doc.amount || docItems.total || 0)

  // -------------------------------------------------------------
  // LEVEL 0: STRICT CUSTOMER GATE & ISOLATION
  // If the PO has an identified destination customer, ONLY invoices
  // belonging to that customer may EVER be considered.
  // Invoices for any other company are strictly DISQUALIFIED (Score = 0).
  // -------------------------------------------------------------
  const shipTo = String(
    po.shipToName ||
    poItems.delivery_customer_name ||
    poItems.customer_name ||
    poItems.ship_via ||
    poItems.recipient_name ||
    poItems.attention ||
    poItems.delivery_address?.attention ||
    ""
  ).trim()

  const poAddress = String(
    po.shippingAddress ||
    poItems.delivery_address?.address ||
    poItems.delivery_address ||
    poItems.shipping_address ||
    poItems.recipient_address ||
    poItems.address ||
    poItems.city ||
    ""
  ).trim()

  const isPoToWarehouse = isTitanWarehouse(shipTo) || isTitanWarehouse(poAddress)

  const docCustomer = String(
    doc.account?.name ||
    docItems.customer_name ||
    ""
  ).trim()

  const docShipObj = docItems.shipping_address || docItems.delivery_address || {}
  const docShipStr = typeof docShipObj === 'string' ? docShipObj : JSON.stringify(docShipObj)
  const accountShipAddr = `${doc.account?.shippingStreet || ''} ${doc.account?.shippingCity || ''} ${doc.account?.shippingState || ''} ${doc.account?.shippingZip || ''}`
  const accountBillAddr = `${doc.account?.billingStreet || ''} ${doc.account?.billingCity || ''} ${doc.account?.billingState || ''} ${doc.account?.billingZip || ''}`
  const docAddressCombined = `${docShipStr} ${docCustomer} ${accountShipAddr} ${accountBillAddr}`

  const hasVerifiedCustomer = !isPoToWarehouse && shipTo.length > 1

  if (hasVerifiedCustomer) {
    const custMatches = isCustomerMatch(shipTo, docCustomer, poAddress, docAddressCombined, doc.account?.contacts)
    if (!custMatches) {
      return {
        score: 0,
        reasons: [`Disqualified: PO is for '${shipTo}', but document belongs to '${docCustomer || 'Unknown'}'`],
        matchDetails: {}
      }
    }
  } else if (isPoToWarehouse) {
    // Internal warehouse order - cannot match external customer invoice unless explicitly referenced
    if (!evaluatePOReference(po, doc).exact) {
      return { score: 0, reasons: ['Warehouse PO requires an exact document reference'], matchDetails: {} }
    }
  }

  // Record customer match
  if (hasVerifiedCustomer && docCustomer) {
    score += 40
    reasons.push(`Customer Verified: '${docCustomer}'`)
    matchDetails.addressMatch = `Customer Verified: '${docCustomer}'`
  }

  // Dropship address match (+20 pts)
  if (poAddress && poAddress.length > 5 && docAddressCombined.length > 5) {
    const poAddTokens = tokenizeClean(poAddress)
    const matchedTokens = poAddTokens.filter((t: string) => docAddressCombined.toLowerCase().includes(t))
    if (matchedTokens.length >= 2) {
      score += 20
      reasons.push(`Dropship Address Match: ${matchedTokens.slice(0, 3).join(", ")}`)
      matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Address (${matchedTokens.slice(0, 3).join(", ")})`
    }
  }

  // -------------------------------------------------------------
  // LEVEL 1: DIRECT IDENTIFIER MATCH (Within the Verified Customer)
  // Check exact Invoice #, Sales Order #, or Estimate #
  // -------------------------------------------------------------
  const reference = evaluatePOReference(po, doc)
  if (reference.exact) {
    score += 55
    reasons.push('Exact normalized document reference')
    matchDetails.referenceMatch = 'Exact normalized document reference'
  }

  // -------------------------------------------------------------
  // 3. Product SKU & Line Item Quantity Matcher (Up to 55 points)
  // Supports multi-PO invoices (1 invoice can have multiple POs)
  // -------------------------------------------------------------
  const extractItems = (record: any, rawItems: any): any[] => {
    let list: any[] = []
    if (Array.isArray(record?.lineItems) && record.lineItems.length > 0) list = record.lineItems
    else if (Array.isArray(rawItems?.lineItems)) list = rawItems.lineItems
    else if (Array.isArray(rawItems?.line_items)) list = rawItems.line_items
    else if (Array.isArray(rawItems?.lineItemDetails)) list = rawItems.lineItemDetails
    else if (Array.isArray(rawItems)) list = rawItems
    else if (Array.isArray(record?.items)) list = record.items
    return financialZohoLineItems(list)
  }

  const poLineItems = extractItems(po, poItems)
  const docLineItems = extractItems(doc, docItems)

  // Consume quantities once: repeated PO lines must not reuse the same invoice capacity.
  if (poLineItems.length && docLineItems.length) {
    const key = (item: any) => String(item.sku || item.name || item.item_name || item.productName || item.description || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const remaining = docLineItems.map((item: any) => Number(item.quantity ?? item.qty ?? 0))
    for (const item of poLineItems) {
      let demand = Number(item.quantity ?? item.quantity_ordered ?? item.qty ?? 0)
      if (!Number.isFinite(demand) || demand <= 0) return { score: 0, reasons: ['Review required: missing or invalid PO quantity'], matchDetails: {} }
      for (let i = 0; i < docLineItems.length && demand > 0; i++) {
        const target = docLineItems[i]
        if ((item.item_id && target.item_id && String(item.item_id) === String(target.item_id)) || (key(item) && key(item) === key(target))) {
          const used = Math.min(demand, Number.isFinite(remaining[i]) ? Math.max(0, remaining[i]) : 0)
          demand -= used
          remaining[i] -= used
        }
      }
      if (demand > 0.000001) return { score: 0, reasons: ['Review required: PO item quantities exceed document capacity'], matchDetails: {} }
    }
  }

  let matchedRetailTotal = 0
  if (poLineItems.length > 0 && docLineItems.length > 0) {
    const matchedSummaries: string[] = []
    let exactQtyCount = 0
    let compatibleQtyCount = 0
    let validPoItemCount = 0

    for (const poItem of poLineItems) {
      const poSku = String(poItem.sku || poItem.name || poItem.item_name || poItem.productName || poItem.description || "").toLowerCase().trim()
      const poSkuClean = poSku.replace(/[^a-z0-9]/g, "")
      const poQty = Number(poItem.quantity || poItem.quantity_ordered || poItem.qty || 0)

      if (!poSkuClean || poSkuClean.length < 3) continue
      validPoItemCount++

      let bestInvMatch: any = null
      let isExactQty = false
      let isCompatQty = false

      for (const invItem of docLineItems) {
        const invSku = String(invItem.sku || invItem.name || invItem.item_name || invItem.productName || invItem.description || "").toLowerCase().trim()
        const invSkuClean = invSku.replace(/[^a-z0-9]/g, "")
        const invQty = Number(invItem.quantity || invItem.qty || 0)

        const poItemId = poItem.item_id ? String(poItem.item_id) : ""
        const invItemId = invItem.item_id ? String(invItem.item_id) : ""
        const isSkuMatch = (poSkuClean && invSkuClean && poSkuClean === invSkuClean) ||
          (poItemId && invItemId && poItemId === invItemId)

        if (isSkuMatch) {
          if (poQty > 0 && invQty === poQty) {
            bestInvMatch = invItem
            isExactQty = true
            isCompatQty = true
            break
          } else if (poQty > 0 && invQty >= poQty) {
            bestInvMatch = invItem
            isCompatQty = true
          } else if (!bestInvMatch) {
            bestInvMatch = invItem
          }
        }
      }

      if (bestInvMatch) {
        const itemName = poItem.name || poItem.item_name || poItem.sku || poSku
        const invRate = Number(bestInvMatch.rate || bestInvMatch.unitPrice || 0)
        matchedRetailTotal += invRate > 0 ? (invRate * (poQty > 0 ? poQty : 1)) : Number(bestInvMatch.item_total || bestInvMatch.total || 0)

        if (isExactQty) {
          exactQtyCount++
          matchedSummaries.push(`${poQty}x ${itemName}`)
        } else if (isCompatQty) {
          compatibleQtyCount++
          matchedSummaries.push(`${poQty}x of ${bestInvMatch.quantity || bestInvMatch.qty} ${itemName}`)
        } else {
          matchedSummaries.push(itemName)
        }
      }
    }

    if (validPoItemCount > 0) {
      if (matchedSummaries.length < validPoItemCount) {
        // Disqualified! If it's on the PO it must be on the order 100%!
        return {
          score: 0,
          reasons: [`Disqualified: PO has ${validPoItemCount - matchedSummaries.length} item(s) not found on document`],
          matchDetails: {}
        }
      }

      const isAllExact = exactQtyCount === validPoItemCount
      const isAllCompat = (exactQtyCount + compatibleQtyCount) === validPoItemCount

      if (isAllExact) {
        score += 55 // All items and quantities matched!
        const label = `All ${validPoItemCount} Line Items & Quantities Matched: ${matchedSummaries.slice(0, 3).join(", ")}`
        reasons.push(label)
        matchDetails.itemMatch = label
      } else if (isAllCompat) {
        score += 45 // All items matched with compatible quantities (multi-PO order)
        const label = `${matchedSummaries.length} Items & Qty Matched (Multi-PO Fulfillment): ${matchedSummaries.slice(0, 3).join(", ")}`
        reasons.push(label)
        matchDetails.itemMatch = label
      }
    }
  }

  // -------------------------------------------------------------
  // 4. Date Proximity (Up to 25 points)
  // -------------------------------------------------------------
  const poDate = po.date ? new Date(po.date) : null
  const rawDate = doc.issueDate || doc.orderDate || doc.createdAt || docItems.date || docItems.issue_date || docItems.created_time
  const docDate = rawDate ? new Date(rawDate) : null

  if (poDate && docDate && !isNaN(poDate.getTime()) && !isNaN(docDate.getTime())) {
    const diffDaysFloat = (poDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)
    const absDiffDays = Math.abs(diffDaysFloat)
    const roundedDays = Math.round(absDiffDays)

    if (absDiffDays > 60) {
      return {
        score: 0,
        reasons: [`Disqualified: Date difference of ${roundedDays} days is too large (> 60 days)`],
        matchDetails: {}
      }
    }

    if (roundedDays === 0) {
      score += 25
      reasons.push(`Exact Same Day (${poDate.toISOString().slice(0, 10)})`)
      matchDetails.dateMatch = `Exact Same Day`
    } else if (diffDaysFloat >= -2 && diffDaysFloat <= 14) {
      score += 25
      reasons.push(`Order Processing Window (+${roundedDays}d)`)
      matchDetails.dateMatch = `Processing Window (+${roundedDays}d)`
    } else if (absDiffDays <= 30) {
      score += 15
      reasons.push(`Date Window (±${roundedDays}d)`)
      matchDetails.dateMatch = `Date Window (±${roundedDays}d)`
    }
  }

  // -------------------------------------------------------------
  // 5. Wholesale Cost vs Retail Selling Price (The Profit Margin Math) (Up to 30 points)
  // PO is for buying at wholesale cost; Invoice is for selling at retail for profit!
  // -------------------------------------------------------------
  if (poTotal > 0 && docTotal > 0) {
    // Check recorded invoice dead cost from custom fields / custom_field_hash
    const customFields = docItems.custom_fields || []
    const cfHash = docItems.custom_field_hash || {}
    let recordedDeadCost = 0

    if (cfHash.cf_dead_cost_total) {
      recordedDeadCost = parseFloat(String(cfHash.cf_dead_cost_total).replace(/[^0-9.]/g, '')) || 0
    }
    if (!recordedDeadCost && Array.isArray(customFields)) {
      const deadCostField = customFields.find((cf: any) => cf.api_name === 'cf_dead_cost_total' || String(cf.label || '').toLowerCase().includes('dead cost'))
      if (deadCostField) {
        recordedDeadCost = parseFloat(String(deadCostField.value).replace(/[^0-9.]/g, '')) || 0
      }
    }
    if (!recordedDeadCost && doc.computedDeadCost) {
      recordedDeadCost = Number(doc.computedDeadCost)
    }

    if (recordedDeadCost > 0 && Math.abs(poTotal - recordedDeadCost) / poTotal < 0.15) {
      score += 30
      reasons.push(`Matches Recorded Invoice Dead Cost ($${poTotal.toFixed(2)} cost vs $${recordedDeadCost.toFixed(2)} recorded)`)
      matchDetails.amountMatch = `Matches Recorded Dead Cost ($${poTotal.toFixed(2)} vs $${recordedDeadCost.toFixed(2)})`
    } else if (poTotal <= docTotal) {
      const costRatio = poTotal / docTotal
      const grossMargin = Math.round((1 - costRatio) * 100)
      if (costRatio >= 0.15 && costRatio <= 0.85) {
        score += 25
        reasons.push(`Profitable Wholesale Cost ($${poTotal.toFixed(2)} cost on $${docTotal.toFixed(2)} retail, ${grossMargin}% gross margin)`)
        matchDetails.amountMatch = `Profitable Wholesale Cost (${grossMargin}% Margin)`
      } else if (matchedRetailTotal > 0 && poTotal <= matchedRetailTotal) {
        score += 25
        reasons.push(`Wholesale Cost for Matched Items ($${poTotal.toFixed(2)} vs $${matchedRetailTotal.toFixed(2)} retail)`)
        matchDetails.amountMatch = `Wholesale Cost for Matched Items`
      } else {
        score += 15
        reasons.push(`Wholesale Cost <= Retail Total ($${poTotal.toFixed(2)} vs $${docTotal.toFixed(2)})`)
        matchDetails.amountMatch = `Wholesale Cost <= Retail Total`
      }
    }
  }

  const finalScore = Math.min(100, score)
  return { score: finalScore, reasons, matchDetails }
}

/** Scores support review only. Inferred writes require the separate audited provider-evidence workflow. */
export function computePOMatchScore(po: any, doc: any): MatchScoreResult {
  const reference = evaluatePOReference(po, doc)
  const blocked = (reason: string): MatchScoreResult => ({ score: 0, reasons: [reason], matchDetails: {}, referenceStatus: 'conflict', requiresReview: true, autoWriteEligible: false })
  if (reference.conflict) return blocked('Review required: explicit PO reference is unresolved, ambiguous, or conflicts with this document')
  const poCustomerId = po.items?.delivery_customer_id
  const docCustomerId = doc.items?.customer_id
  if (poCustomerId && docCustomerId && String(poCustomerId) !== String(docCustomerId)) return blocked('Review required: customer IDs conflict')
  const result = computeSupportingScore(po, doc)
  return { ...result, referenceStatus: reference.exact ? (result.score > 0 ? 'exact' : 'conflict') : 'fuzzy', requiresReview: true, autoWriteEligible: false }
}

export function rankPOMatches(po: any, documents: any[]) {
  return documents.map(doc => ({ doc, ...computePOMatchScore(po, doc) }))
    .filter(result => result.score > 0)
    .sort((a, b) => Number(b.referenceStatus === 'exact') - Number(a.referenceStatus === 'exact') || b.score - a.score || String(a.doc.id).localeCompare(String(b.doc.id)))
}

export function computePaymentMatchScore(payment: any, doc: any): MatchScoreResult {
  let score = 0
  const reasons: string[] = []
  const matchDetails: MatchScoreResult['matchDetails'] = {}

  const payItems = payment.items || {}
  const docItems = doc.items || {}

  // -------------------------------------------------------------
  // 1. Customer Account & Name Matcher (Strict Filter)
  // -------------------------------------------------------------
  let rawPayCustomer = String(payment.customerName || payItems.customer_name || payItems.customer_id || payment.description || "").trim()

  if (rawPayCustomer.toLowerCase().includes("customer:")) {
    const parts = rawPayCustomer.split("|")
    const custPart = parts.find(p => p.toLowerCase().includes("customer:")) || parts[0]
    rawPayCustomer = custPart.replace(/.*customer:\s*/i, "").trim()
  }

  const payCustomer = rawPayCustomer.toLowerCase()
  const docCustomer = String(
    doc.account?.name ||
    doc.accountName ||
    doc.customer_name ||
    docItems.customer_name ||
    docItems.shipping_address?.company_name ||
    docItems.billing_address?.company_name ||
    ""
  ).toLowerCase().trim()

  const stopWords = new Set(['llc', 'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'services', 'tool', 'general', 'and', '&', 'the', 'usa', 'pavers', 'landscaping', 'landscapes', 'dnr', 'group', 'construction', 'construct', 'concrete', 'building', 'materials', 'sons', 'bros', 'brothers', 'contracting', 'excavating', 'masonry', 'paving', 'design', 'solutions', 'enterprises', 'associates', 'supply', 'surfaces', 'surface', 'all'])
  const payTokens = payCustomer.split(/[\s,.-]+/).filter(t => t.length > 2 && !stopWords.has(t))
  const docTokens = docCustomer.split(/[\s,.-]+/).filter(t => t.length > 2 && !stopWords.has(t))

  if (payCustomer.length > 2 && docCustomer.length > 2) {
    const hasTokenOverlap = payTokens.some(t => docTokens.includes(t)) || docTokens.some(t => payTokens.includes(t))
    const isExactOrSubstring = (payCustomer.length > 5 && docCustomer.length > 5 && (payCustomer.includes(docCustomer) || docCustomer.includes(payCustomer)))

    const isMatch = hasTokenOverlap || isExactOrSubstring

    if (!isMatch) {
      return {
        score: 0,
        reasons: [`Customer mismatch: Payment customer '${rawPayCustomer}' does not match doc customer '${doc.account?.name || docCustomer.toUpperCase()}'`],
        matchDetails: {}
      }
    }

    score += 50 // High score for matching customer account!
    const displayCustomerName = doc.account?.name || docCustomer.toUpperCase()
    reasons.push(`Customer Account Match: ${displayCustomerName}`)
    matchDetails.addressMatch = `Customer '${displayCustomerName}'`
  }

  // -------------------------------------------------------------
  // 2. Exact or Proximity Amount Matcher (Grand Total vs Subtotal)
  // Customer payments pay the Grand Total (with shipping, adjustments, tax), not just subtotal
  // -------------------------------------------------------------
  const payAmount = Number(payment.amount || payItems.amount || 0)
  // Grand total takes precedence from items.total, items.bcy_total, or doc.amount
  const docGrandTotal = Number(docItems.total || docItems.bcy_total || doc.amount || 0)
  const docSubTotal = Number(docItems.sub_total || doc.amount || 0)
  const docEffectiveTotal = docGrandTotal > 0 ? docGrandTotal : docSubTotal

  if (payAmount > 0 && docEffectiveTotal > 0) {
    const grandDiff = Math.abs(payAmount - docGrandTotal)
    const subDiff = Math.abs(payAmount - docSubTotal)

    if (grandDiff < 0.01) {
      score += 45 // Exact Grand Total match!
      reasons.push(`Exact Grand Total $${payAmount.toFixed(2)}`)
      matchDetails.amountMatch = `Exact Grand Total $${payAmount.toFixed(2)}`
    } else if (subDiff < 0.01) {
      score += 40 // Exact Subtotal match
      reasons.push(`Exact Subtotal $${payAmount.toFixed(2)}`)
      matchDetails.amountMatch = `Exact Subtotal $${payAmount.toFixed(2)}`
    } else if (payAmount <= docEffectiveTotal) {
      const payPercent = Math.round((payAmount / docEffectiveTotal) * 100)
      if (payPercent >= 20) {
        score += 20
        reasons.push(`Partial Payment (${payPercent}% of invoice total $${docEffectiveTotal.toFixed(2)})`)
        matchDetails.amountMatch = `Partial Payment (${payPercent}%)`
      }
    } else if (grandDiff / payAmount < 0.05) {
      score += 20
      reasons.push(`Near Amount ($${payAmount.toFixed(2)} vs $${docEffectiveTotal.toFixed(2)})`)
      matchDetails.amountMatch = `Near Amount`
    }
  }

  // -------------------------------------------------------------
  // 3. Date Proximity Window (Invoice created before or near payment date)
  // -------------------------------------------------------------
  const payDate = payment.date ? new Date(payment.date) : null
  const rawDocDate = doc.issueDate || doc.orderDate || doc.createdAt || docItems.date || docItems.issue_date
  const docDate = rawDocDate ? new Date(rawDocDate) : null

  if (payDate && docDate && !isNaN(payDate.getTime()) && !isNaN(docDate.getTime())) {
    const diffDaysFloat = (payDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)
    const absDiffDays = Math.abs(diffDaysFloat)
    const roundedDays = Math.round(absDiffDays)

    if (diffDaysFloat >= -2 && diffDaysFloat <= 30) {
      score += 25
      reasons.push(`Payment Date Window (${roundedDays}d relative to Invoice)`)
      matchDetails.dateMatch = `Payment Date Window (${roundedDays}d)`
    } else if (absDiffDays <= 45) {
      score += 15
      reasons.push(`Extended Date Window (${roundedDays}d)`)
      matchDetails.dateMatch = `Extended Date Window (${roundedDays}d)`
    }
  }

  // -------------------------------------------------------------
  // 4. Reference Number Match (Check #, Invoice # in reference)
  // -------------------------------------------------------------
  const payRef = String(payment.referenceNumber || payItems.reference_number || "").trim().toLowerCase()
  const docNumber = String(doc.invoiceNumber || doc.salesorderNumber || docItems.invoiceNumber || doc.zohoId || "").trim().toLowerCase()

  if (payRef && payRef.length >= 3 && docNumber && (docNumber.includes(payRef) || payRef.includes(docNumber))) {
    score += 40
    reasons.push(`Ref #${payRef.toUpperCase()} Match`)
    matchDetails.referenceMatch = `Ref #${payRef.toUpperCase()}`
  }

  const finalScore = Math.min(100, score)
  return { score: finalScore, reasons, matchDetails }
}
