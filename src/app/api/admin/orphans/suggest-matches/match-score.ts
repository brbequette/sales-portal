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

export function computePOMatchScore(po: any, doc: any): MatchScoreResult {
  let score = 0
  const reasons: string[] = []
  const matchDetails: MatchScoreResult['matchDetails'] = {}

  const docItems = doc.items || {}
  const poItems = po.items || {}

  // -------------------------------------------------------------
  // 0. Strict Customer Company Filter
  // If PO specifies a customer/recipient company, candidate must belong to that customer!
  // -------------------------------------------------------------
  const poCustomer = String(
    po.shipToName ||
    poItems.delivery_customer_name ||
    poItems.customer_name ||
    poItems.recipient_name ||
    poItems.attention ||
    poItems.delivery_address?.attention ||
    poItems.delivery_address?.customer_name ||
    ""
  ).toLowerCase().trim()

  const docCustomer = String(
    doc.account?.name ||
    docItems.customer_name ||
    ""
  ).toLowerCase().trim()

  const stopWords = new Set(['llc', 'inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'services', 'tool', 'general', 'and', '&', 'the', 'usa'])
  const poTokens = poCustomer.split(/[\s,.-]+/).filter(t => t.length > 2 && !stopWords.has(t))
  const docTokens = docCustomer.split(/[\s,.-]+/).filter(t => t.length > 2 && !stopWords.has(t))

  if (poTokens.length > 0 && docTokens.length > 0) {
    const hasOverlap = poTokens.some(t => docCustomer.includes(t)) || docTokens.some(t => poCustomer.includes(t))
    
    const accountShipAddr = `${doc.account?.shippingStreet || ''} ${doc.account?.shippingCity || ''} ${doc.account?.shippingState || ''} ${doc.account?.shippingZip || ''}`.toLowerCase().trim()
    const accountBillAddr = `${doc.account?.billingStreet || ''} ${doc.account?.billingCity || ''} ${doc.account?.billingState || ''} ${doc.account?.billingZip || ''}`.toLowerCase().trim()
    const poAddress = String(po.shippingAddress || poItems.delivery_address?.address || poItems.delivery_address || poItems.shipping_address || "").toLowerCase().trim()
    
    const poAddrTokens = poAddress.split(/[\s,]+/).filter(t => t.length > 2 && !['street', 'road', 'drive', 'blvd', 'suite', 'unit', 'north', 'south', 'east', 'west', 'avenue', 'lane', 'court'].includes(t))
    const addressOverlap = poAddrTokens.some(t => accountShipAddr.includes(t) || accountBillAddr.includes(t))

    const poRef = String(po.salesOrderNumber || po.referenceNumber || poItems.salesorder_number || poItems.reference_number || (poItems.salesorders && poItems.salesorders[0]?.salesorder_number) || "").trim().toLowerCase()
    const docNumber = String(doc.invoiceNumber || doc.salesorderNumber || docItems.invoiceNumber || docItems.salesorder_number || doc.zohoId || "").trim().toLowerCase()
    const isRefMatch = poRef && poRef.length >= 3 && (docNumber.includes(poRef) || poRef.includes(docNumber))

    // If both PO and document specify customer names, but share ZERO name/address tokens and no reference match: exclude!
    if (!hasOverlap && !addressOverlap && !isRefMatch) {
      return {
        score: 0,
        reasons: [`Customer mismatch: PO customer '${po.shipToName || poCustomer}' does not match doc customer '${doc.account?.name || docCustomer}'`],
        matchDetails: {}
      }
    }
  }

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
  // -------------------------------------------------------------
  const shipTo = String(po.shipToName || poItems.delivery_customer_name || poItems.customer_name || poItems.ship_via || poItems.recipient_name || poItems.attention || poItems.delivery_address?.attention || "").toLowerCase().trim()
  const poAddress = String(po.shippingAddress || poItems.delivery_address?.address || poItems.delivery_address || poItems.shipping_address || poItems.recipient_address || poItems.address || poItems.city || "").toLowerCase().trim()
  
  const customerName = String(doc.account?.name || docItems.customer_name || "").toLowerCase().trim()
  const docShipObj = docItems.shipping_address || docItems.delivery_address || {}
  const docShipStr = (typeof docShipObj === 'string' ? docShipObj : JSON.stringify(docShipObj)).toLowerCase()
  
  const accountShipAddr = `${doc.account?.shippingStreet || ''} ${doc.account?.shippingCity || ''} ${doc.account?.shippingState || ''} ${doc.account?.shippingZip || ''}`.toLowerCase().trim()
  const accountBillAddr = `${doc.account?.billingStreet || ''} ${doc.account?.billingCity || ''} ${doc.account?.billingState || ''} ${doc.account?.billingZip || ''}`.toLowerCase().trim()
  const docAccountAddr = `${doc.account?.name || ''} ${accountShipAddr} ${accountBillAddr}`.toLowerCase()
  const docAddressCombined = `${docShipStr} ${docAccountAddr}`

  let addressMatched = false

  if (poAddress && poAddress.length > 3) {
    const poAddTokens = poAddress.split(/[\s,]+/).filter((t: string) => t.length > 2 && !['street', 'road', 'drive', 'blvd', 'suite', 'unit', 'north', 'south', 'east', 'west', 'avenue', 'lane', 'court'].includes(t))
    const matchedTokens = poAddTokens.filter((t: string) => docAddressCombined.includes(t))
    
    if (matchedTokens.length >= 2 || (poAddTokens.length >= 1 && (docAddressCombined.includes(poAddress) || poAddress.includes(docAddressCombined)))) {
      addressMatched = true
      score += 60 // Customer Account & Address Identified!
      const label = doc.account?.name ? `Customer Account '${doc.account.name}' Address Match` : `Dropship Address Match`
      reasons.push(`${label}: ${matchedTokens.slice(0, 3).join(", ")}`)
      matchDetails.addressMatch = `${label} (${matchedTokens.slice(0, 3).join(", ")})`
    }
  }

  if (!addressMatched && shipTo && customerName) {
    if (shipTo === customerName || customerName.includes(shipTo) || shipTo.includes(customerName)) {
      score += 40
      reasons.push(`Customer Account '${doc.account?.name || docItems.customer_name}' Match`)
      matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Customer '${doc.account?.name || docItems.customer_name}'`
    } else {
      const poTokens = shipTo.split(/\s+/).filter((t: string) => t.length > 2)
      const matchesToken = poTokens.some((t: string) => customerName.includes(t))
      if (matchesToken) {
        score += 25
        reasons.push(`Customer Name Token Match`)
        matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Customer Token Match`
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
      const poSku = String(poItem.sku || poItem.name || poItem.productName || poItem.description || "").toLowerCase().trim()
      const poSkuClean = poSku.replace(/[^a-z0-9]/g, "")
      const poQty = Number(poItem.quantity || poItem.quantity_ordered || poItem.qty || 0)

      if (!poSkuClean || poSkuClean.length < 3) continue
      validPoItemCount++

      let bestInvMatch: any = null
      let isExactQty = false
      let isCompatQty = false

      for (const invItem of docLineItems) {
        const invSku = String(invItem.sku || invItem.name || invItem.productName || invItem.description || "").toLowerCase().trim()
        const invSkuClean = invSku.replace(/[^a-z0-9]/g, "")
        const invQty = Number(invItem.quantity || invItem.qty || 0)

        const isSkuMatch = poSkuClean && invSkuClean && (invSkuClean.includes(poSkuClean) || poSkuClean.includes(invSkuClean))
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
        const itemName = poItem.name || poItem.sku || poSku
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
      const matchedRatio = matchedSummaries.length / validPoItemCount

      if (isAllExact) {
        score += 55 // All items and quantities matched!
        const label = `${validPoItemCount} of ${validPoItemCount} Items & Qty Matched: ${matchedSummaries.slice(0, 3).join(", ")}`
        reasons.push(label)
        matchDetails.itemMatch = label
      } else if (isAllCompat) {
        score += 45 // All items matched with compatible quantities (multi-PO order)
        const label = `${matchedSummaries.length} Items & Qty Matched (Multi-PO Fulfillment): ${matchedSummaries.slice(0, 3).join(", ")}`
        reasons.push(label)
        matchDetails.itemMatch = label
      } else if (matchedRatio >= 0.5) {
        score += 35 // At least half the PO line items matched
        const label = `${matchedSummaries.length} of ${validPoItemCount} Line Items Matched: ${matchedSummaries.slice(0, 3).join(", ")}`
        reasons.push(label)
        matchDetails.itemMatch = label
      } else {
        score += 25 // Partial SKU match
        const label = `Line Item Matched: ${matchedSummaries.slice(0, 2).join(", ")}`
        reasons.push(label)
        matchDetails.itemMatch = label
      }
    }
  }

  // -------------------------------------------------------------
  // 4. 10-Day Match Window & Operational Timeline (Up to 25 points)
  // -------------------------------------------------------------
  const poDate = po.date ? new Date(po.date) : null
  const rawDate = doc.issueDate || doc.orderDate || doc.createdAt || docItems.date || docItems.issue_date || docItems.created_time
  const docDate = rawDate ? new Date(rawDate) : null

  if (poDate && docDate && !isNaN(poDate.getTime()) && !isNaN(docDate.getTime())) {
    const diffDaysFloat = (poDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)
    const absDiffDays = Math.abs(diffDaysFloat)
    const roundedDays = Math.round(absDiffDays)

    if (diffDaysFloat >= -3 && diffDaysFloat <= 10) {
      score += 25
      reasons.push(`10-Day Window (+${roundedDays}d after Est/Order)`)
      matchDetails.dateMatch = `10-Day Window (+${roundedDays}d)`
    } else if (diffDaysFloat > 10 && diffDaysFloat <= 17) {
      score += 15
      reasons.push(`Processing Window (+${roundedDays}d after Est/Order)`)
      matchDetails.dateMatch = `Processing Window (+${roundedDays}d)`
    } else if (diffDaysFloat > 17 && diffDaysFloat <= 25) {
      score += 10
      reasons.push(`Extended Window (+${roundedDays}d)`)
      matchDetails.dateMatch = `Extended Window (+${roundedDays}d)`
    } else if (absDiffDays <= 10) {
      score += 20
      reasons.push(`Date ±${roundedDays}d`)
      matchDetails.dateMatch = `Date ±${roundedDays}d`
    }
  }

  // -------------------------------------------------------------
  // 5. Total Amount Cost vs Retail Proximity Matcher (Up to 25 points)
  // Accommodates multi-PO invoices (1 invoice can have multiple POs)
  // -------------------------------------------------------------
  const poTotal = Number(po.total || poItems.total || 0)
  const docTotal = Number(doc.amount || docItems.total || 0)

  if (poTotal > 0 && docTotal > 0) {
    const diff = Math.abs(poTotal - docTotal)
    if (diff < 0.01) {
      score += 25
      reasons.push(`Exact Total $${poTotal.toFixed(2)}`)
      matchDetails.amountMatch = `Exact Amount $${poTotal.toFixed(2)}`
    } else if (matchedRetailTotal > 0 && poTotal <= matchedRetailTotal) {
      const costPercent = Math.round((poTotal / matchedRetailTotal) * 100)
      score += 25
      reasons.push(`Cost vs Retail for Matched Items (${costPercent}% of retail: $${poTotal.toFixed(2)} vs $${matchedRetailTotal.toFixed(2)})`)
      matchDetails.amountMatch = `Cost vs Retail for Items (${costPercent}% of retail)`
    } else if (poTotal <= docTotal) {
      const costPercent = Math.round((poTotal / docTotal) * 100)
      score += 20
      reasons.push(`Multi-PO Compatible Total (${costPercent}% of Invoice: $${poTotal.toFixed(2)} of $${docTotal.toFixed(2)})`)
      matchDetails.amountMatch = `Multi-PO Total (${costPercent}% of Invoice)`
    } else if (diff / poTotal < 0.08) {
      score += 15
      reasons.push(`Near Total ($${poTotal.toFixed(2)} vs $${docTotal.toFixed(2)})`)
      matchDetails.amountMatch = `Near Amount ($${poTotal.toFixed(2)} vs $${docTotal.toFixed(2)})`
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
