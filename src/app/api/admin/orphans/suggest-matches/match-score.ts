import { financialZohoLineItems } from '@/lib/zoho-line-items'

export interface MatchScoreResult {
  score: number
  reasons: string[]
  matchDetails: {
    referenceMatch?: string | null
    addressMatch?: string | null
    itemMatch?: string | null
    dateMatch?: string | null
    amountMatch?: string | null
  }
}

export function isTitanWarehouse(str: string): boolean {
  const s = String(str || '').toLowerCase()
  return (s.includes('8321') && s.includes('evans')) || s.includes('titan diamond')
}

export function tokenizeClean(str: string): string[] {
  const stopWords = new Set([
    'llc', 'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited',
    'services', 'tool', 'general', 'and', '&', 'the', 'usa', 'road', 'street',
    'drive', 'blvd', 'suite', 'unit', 'ave', 'avenue', 'north', 'south', 'east', 'west'
  ])
  return String(str || '')
    .toLowerCase()
    .split(/[\s,.-]+/)
    .filter(t => t.length > 2 && !stopWords.has(t))
}

export function computePOMatchScore(po: any, doc: any): MatchScoreResult {
  let score = 0
  const reasons: string[] = []
  const matchDetails: MatchScoreResult['matchDetails'] = {}

  const docItems = doc.items || {}
  const poItems = po.items || {}

  const poTotal = Number(po.total || poItems.total || 0)
  const docTotal = Number(doc.amount || docItems.total || 0)

  // -------------------------------------------------------------
  // 1. Sales Order / Estimate / Reference Number Match (Up to 80 points)
  // -------------------------------------------------------------
  const poRef = String(
    po.salesOrderNumber || 
    po.referenceNumber || 
    poItems.salesorder_number || 
    poItems.reference_number || 
    (poItems.salesorders && poItems.salesorders[0]?.salesorder_number) ||
    po.poNumber || ""
  ).trim().toLowerCase()
  
  const docNumber = String(
    doc.invoiceNumber || 
    doc.salesorderNumber || 
    docItems.invoiceNumber || 
    docItems.salesOrderNumber || 
    docItems.salesorder_number || 
    docItems.quote_number || 
    docItems.estimate_number || 
    docItems.reference_number || 
    doc.zohoId || ""
  ).trim().toLowerCase()
  
  const docRefNum = String(
    docItems.reference_number || 
    docItems.customer_po || 
    docItems.estimate_number || 
    docItems.estimateNumber || 
    docItems.salesorder_number || ""
  ).trim().toLowerCase()

  const poDigits = poRef.replace(/\D/g, "")
  const docDigits = docNumber.replace(/\D/g, "")
  const docRefDigits = docRefNum.replace(/\D/g, "")

  if (poRef && poRef.length >= 2) {
    if (poRef === docNumber || poRef === docRefNum) {
      score += 80
      reasons.push(`SO / Est / Ref #${poRef.toUpperCase()} Exact Match`)
      matchDetails.referenceMatch = `Exact SO / Est / Ref #${poRef.toUpperCase()}`
    } else if (docNumber.includes(poRef) || poRef.includes(docNumber) || docRefNum.includes(poRef) || (poRef.length >= 3 && docRefNum.includes(poRef))) {
      score += 60
      reasons.push(`SO / Est / Ref #${poRef.toUpperCase()} Match`)
      matchDetails.referenceMatch = `SO / Est / Ref #${poRef.toUpperCase()}`
    } else if (poDigits.length >= 4 && (docDigits === poDigits || docRefDigits === poDigits)) {
      score += 60
      reasons.push(`SO / Est Digits #${poDigits} Match`)
      matchDetails.referenceMatch = `SO / Est Digits #${poDigits}`
    }
  }

  // -------------------------------------------------------------
  // 2. Customer Identification via Dropship Shipping Address & Account Address (Up to 60 points)
  // Excludes Titan Diamond's own warehouse from matching against internal accounts!
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
  ).toLowerCase().trim()

  const poAddress = String(
    po.shippingAddress ||
    poItems.delivery_address?.address ||
    poItems.delivery_address ||
    poItems.shipping_address ||
    poItems.recipient_address ||
    poItems.address ||
    poItems.city ||
    ""
  ).toLowerCase().trim()

  const isPoToWarehouse = isTitanWarehouse(shipTo) || isTitanWarehouse(poAddress)

  const docCustomer = String(
    doc.account?.name ||
    docItems.customer_name ||
    ""
  ).toLowerCase().trim()

  const docShipObj = docItems.shipping_address || docItems.delivery_address || {}
  const docShipStr = (typeof docShipObj === 'string' ? docShipObj : JSON.stringify(docShipObj)).toLowerCase()
  
  const accountShipAddr = `${doc.account?.shippingStreet || ''} ${doc.account?.shippingCity || ''} ${doc.account?.shippingState || ''} ${doc.account?.shippingZip || ''}`.toLowerCase().trim()
  const accountBillAddr = `${doc.account?.billingStreet || ''} ${doc.account?.billingCity || ''} ${doc.account?.billingState || ''} ${doc.account?.billingZip || ''}`.toLowerCase().trim()
  const docAccountAddr = `${doc.account?.name || ''} ${accountShipAddr} ${accountBillAddr}`.toLowerCase()
  const docAddressCombined = `${docShipStr} ${docAccountAddr}`

  let addressMatched = false

  if (!isPoToWarehouse) {
    // Check dropship address
    if (poAddress && poAddress.length > 3) {
      const poAddTokens = tokenizeClean(poAddress)
      const matchedTokens = poAddTokens.filter((t: string) => docAddressCombined.includes(t))
      
      if (matchedTokens.length >= 2 || (poAddTokens.length >= 1 && (docAddressCombined.includes(poAddress) || poAddress.includes(docAddressCombined)))) {
        addressMatched = true
        score += 40
        const label = doc.account?.name ? `Customer Account '${doc.account.name}' Address Match` : `Dropship Address Match`
        reasons.push(`${label}: ${matchedTokens.slice(0, 3).join(", ")}`)
        matchDetails.addressMatch = `${label} (${matchedTokens.slice(0, 3).join(", ")})`
      }
    }

    // Check customer name tokens
    if (shipTo && docCustomer) {
      const poTokens = tokenizeClean(shipTo)
      const docTokens = tokenizeClean(docCustomer)
      const tokenOverlap = poTokens.filter(t => docTokens.includes(t) || docCustomer.includes(t))

      if (shipTo === docCustomer || docCustomer.includes(shipTo) || shipTo.includes(docCustomer) || tokenOverlap.length >= 2) {
        score += 50
        const custDisplay = doc.account?.name || docItems.customer_name
        reasons.push(`Customer '${custDisplay}' Matched (${tokenOverlap.slice(0, 3).join(", ") || shipTo})`)
        matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Customer '${custDisplay}'`
      } else if (tokenOverlap.length === 1) {
        score += 30
        reasons.push(`Customer Token Matched (${tokenOverlap[0]})`)
        matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Customer Token (${tokenOverlap[0]})`
      }
    }
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

        const isSkuMatch = poSkuClean && invSkuClean && (
          poSkuClean === invSkuClean ||
          (poSkuClean.length >= 5 && invSkuClean.includes(poSkuClean)) ||
          (invSkuClean.length >= 5 && poSkuClean.includes(invSkuClean))
        )

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

    if (validPoItemCount > 0 && matchedSummaries.length > 0) {
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
      } else {
        score += 35 // Partial line items matched
        const label = `${matchedSummaries.length} of ${validPoItemCount} Line Items Matched: ${matchedSummaries.slice(0, 3).join(", ")}`
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
  // 2. Exact or Proximity Amount Matcher
  // -------------------------------------------------------------
  const payAmount = Number(payment.amount || payItems.amount || 0)
  const docTotal = Number(doc.amount || docItems.total || 0)

  if (payAmount > 0 && docTotal > 0) {
    const diff = Math.abs(payAmount - docTotal)
    if (diff < 0.01) {
      score += 45 // Exact amount match!
      reasons.push(`Exact Amount $${payAmount.toFixed(2)}`)
      matchDetails.amountMatch = `Exact Amount $${payAmount.toFixed(2)}`
    } else if (payAmount <= docTotal) {
      const payPercent = Math.round((payAmount / docTotal) * 100)
      if (payPercent >= 20) {
        score += 20
        reasons.push(`Partial Payment (${payPercent}% of invoice total $${docTotal.toFixed(2)})`)
        matchDetails.amountMatch = `Partial Payment (${payPercent}%)`
      }
    } else if (diff / payAmount < 0.05) {
      score += 20
      reasons.push(`Near Amount ($${payAmount.toFixed(2)} vs $${docTotal.toFixed(2)})`)
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
