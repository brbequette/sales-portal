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

export function computePOMatchScore(po: any, invoice: any): MatchScoreResult {
  let score = 0
  const reasons: string[] = []
  const matchDetails: MatchScoreResult['matchDetails'] = {}

  const invItems = invoice.items || {}
  const poItems = po.items || {}

  // -------------------------------------------------------------
  // 1. Sales Order Number & Reference Number Match (Up to 80 points)
  // -------------------------------------------------------------
  const poRef = String(po.salesOrderNumber || po.referenceNumber || poItems.salesorder_number || poItems.reference_number || po.poNumber || "").trim().toLowerCase()
  
  const invSalesOrderNum = String(invoice.salesorderNumber || invItems.salesOrderNumber || invItems.salesorder_number || invItems.reference_number || invItems.invoiceNumber || invoice.zohoId || "").trim().toLowerCase()
  const invRefNum = String(invItems.reference_number || invItems.customer_po || invItems.estimate_number || invItems.estimateNumber || "").trim().toLowerCase()

  const poDigits = poRef.replace(/\D/g, "")
  const invSoDigits = invSalesOrderNum.replace(/\D/g, "")
  const invRefDigits = invRefNum.replace(/\D/g, "")

  if (poRef && poRef.length >= 2) {
    if (poRef === invSalesOrderNum || poRef === invRefNum) {
      score += 80
      reasons.push(`SO / Ref #${poRef.toUpperCase()} Exact Match`)
      matchDetails.referenceMatch = `Exact SO / Ref #${poRef.toUpperCase()}`
    } else if (invSalesOrderNum.includes(poRef) || poRef.includes(invSalesOrderNum) || invRefNum.includes(poRef) || (poRef.length >= 3 && invRefNum.includes(poRef))) {
      score += 60
      reasons.push(`SO / Ref #${poRef.toUpperCase()} Match`)
      matchDetails.referenceMatch = `SO / Ref #${poRef.toUpperCase()}`
    } else if (poDigits.length >= 4 && (invSoDigits === poDigits || invRefDigits === poDigits)) {
      score += 60
      reasons.push(`SO Digits #${poDigits} Match`)
      matchDetails.referenceMatch = `SO Digits #${poDigits}`
    }
  }

  // -------------------------------------------------------------
  // 2. Customer Identification via Dropship Shipping Address (Up to 50 points)
  // -------------------------------------------------------------
  const shipTo = String(po.shipToName || poItems.delivery_customer_name || poItems.customer_name || poItems.ship_via || poItems.recipient_name || poItems.attention || "").toLowerCase().trim()
  const poAddress = String(po.shippingAddress || poItems.delivery_address || poItems.shipping_address || poItems.recipient_address || poItems.address || poItems.city || "").toLowerCase().trim()
  
  const customerName = String(invoice.account?.name || invItems.customer_name || "").toLowerCase().trim()
  const invShipObj = invItems.shipping_address || {}
  const invShipStr = (typeof invShipObj === 'string' ? invShipObj : JSON.stringify(invShipObj)).toLowerCase()
  const invAccountAddr = `${invoice.account?.shippingStreet || ''} ${invoice.account?.shippingCity || ''} ${invoice.account?.shippingState || ''} ${invoice.account?.shippingZip || ''} ${invoice.account?.billingStreet || ''} ${invoice.account?.billingCity || ''} ${invoice.account?.billingState || ''} ${invoice.account?.billingZip || ''}`.toLowerCase()
  const invAddressCombined = `${invShipStr} ${invAccountAddr}`

  if (poAddress && poAddress.length > 4) {
    const poAddTokens = poAddress.split(/[\s,]+/).filter((t: string) => t.length > 3 && !['street', 'road', 'drive', 'blvd', 'suite', 'unit', 'north', 'south', 'east', 'west'].includes(t))
    const matchedTokens = poAddTokens.filter((t: string) => invAddressCombined.includes(t))
    
    if (matchedTokens.length >= 2 || (poAddTokens.length >= 1 && (invAddressCombined.includes(poAddress) || poAddress.includes(invAddressCombined)))) {
      score += 45 // Customer Identified by Dropship Shipping Address!
      reasons.push(`Customer Identified by Dropship Address: ${matchedTokens.slice(0, 3).join(", ")}`)
      matchDetails.addressMatch = `Dropship Address Match (${matchedTokens.slice(0, 3).join(", ")})`
    }
  }

  if (shipTo && customerName) {
    if (shipTo === customerName || customerName.includes(shipTo) || shipTo.includes(customerName)) {
      score += 35
      reasons.push(`Customer '${invoice.account?.name || invItems.customer_name}'`)
      matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Customer '${invoice.account?.name || invItems.customer_name}'`
    } else {
      const poTokens = shipTo.split(/\s+/).filter((t: string) => t.length > 2)
      const matchesToken = poTokens.some((t: string) => customerName.includes(t))
      if (matchesToken) {
        score += 20
        reasons.push(`Customer Token Match`)
        matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Customer Token Match`
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Product SKU & Line Item Quantity Matcher (Up to 45 points)
  // -------------------------------------------------------------
  const poLineItems = financialZohoLineItems(poItems.lineItems || poItems.line_items || poItems)
  const invLineItems = financialZohoLineItems(invItems.lineItemDetails || invItems.line_items || invItems)

  if (Array.isArray(poLineItems) && Array.isArray(invLineItems) && poLineItems.length > 0 && invLineItems.length > 0) {
    let matchedItemLabel = ""
    let hasQtyMatch = false

    for (const poItem of poLineItems) {
      const poSku = String(poItem.sku || poItem.name || poItem.description || "").toLowerCase().trim()
      const poQty = Number(poItem.quantity || poItem.quantity_ordered || poItem.qty || 0)

      if (!poSku || poSku.length < 3) continue

      for (const invItem of invLineItems) {
        const invSku = String(invItem.sku || invItem.name || invItem.description || "").toLowerCase().trim()
        const invQty = Number(invItem.quantity || invItem.qty || 0)

        if (poSku && invSku && (invSku.includes(poSku) || poSku.includes(invSku))) {
          const itemName = poItem.name || poItem.sku || poSku
          if (poQty > 0 && poQty === invQty) {
            hasQtyMatch = true
            matchedItemLabel = `${poQty}x ${itemName}`
            break
          } else if (!matchedItemLabel) {
            matchedItemLabel = itemName
          }
        }
      }
      if (hasQtyMatch) break
    }

    if (matchedItemLabel) {
      if (hasQtyMatch) {
        score += 45 // Product AND Quantity match!
        reasons.push(`Product & Qty Match: ${matchedItemLabel}`)
        matchDetails.itemMatch = `Product & Qty: ${matchedItemLabel}`
      } else {
        score += 25 // Product SKU match alone
        reasons.push(`Product Match: ${matchedItemLabel}`)
        matchDetails.itemMatch = `Product: ${matchedItemLabel}`
      }
    }
  }

  // -------------------------------------------------------------
  // 4. 10-Day Match Window & Operational Timeline (Up to 25 points)
  // -------------------------------------------------------------
  // Workflow sequence: Estimate/Sales Order/Invoice ($T_{orig}$) -> PO created ($T_{PO}$)
  const poDate = po.date ? new Date(po.date) : null
  const invDate = invoice.issueDate ? new Date(invoice.issueDate) : (invItems.date ? new Date(invItems.date) : null)

  if (poDate && invDate && !isNaN(poDate.getTime()) && !isNaN(invDate.getTime())) {
    // Difference in days: PO date minus Invoice/Estimate date
    const diffDaysFloat = (poDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)
    const absDiffDays = Math.abs(diffDaysFloat)
    const roundedDays = Math.round(absDiffDays)

    // Prime 10-Day Window: PO cut 0 to 10 days after estimate/order/invoice
    if (diffDaysFloat >= -3 && diffDaysFloat <= 10) {
      score += 25
      reasons.push(`10-Day Window (+${roundedDays}d after Est/Inv)`)
      matchDetails.dateMatch = `10-Day Window (+${roundedDays}d)`
    } else if (diffDaysFloat > 10 && diffDaysFloat <= 17) {
      score += 15
      reasons.push(`Processing Window (+${roundedDays}d after Est/Inv)`)
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
  // 5. Total Amount Proximity Match (Up to 25 points)
  // -------------------------------------------------------------
  const poTotal = Number(po.total || poItems.total || 0)
  const invTotal = Number(invoice.amount || invItems.total || 0)

  if (poTotal > 0 && invTotal > 0) {
    const diff = Math.abs(poTotal - invTotal)
    if (diff < 0.01) {
      score += 25
      reasons.push(`Exact Total $${poTotal.toFixed(2)}`)
      matchDetails.amountMatch = `Exact Amount $${poTotal.toFixed(2)}`
    } else if (diff / poTotal < 0.05) {
      score += 15
      reasons.push(`Close Total ($${poTotal.toFixed(2)} vs $${invTotal.toFixed(2)})`)
      matchDetails.amountMatch = `Near Amount ($${poTotal.toFixed(2)} vs $${invTotal.toFixed(2)})`
    }
  }

  const finalScore = Math.min(100, score)
  return { score: finalScore, reasons, matchDetails }
}
