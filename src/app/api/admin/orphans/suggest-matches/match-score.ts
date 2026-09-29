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
  // 1. Sales Order / Estimate / Reference Number Match (Up to 80 points)
  // -------------------------------------------------------------
  const poRef = String(po.salesOrderNumber || po.referenceNumber || poItems.salesorder_number || poItems.reference_number || po.poNumber || "").trim().toLowerCase()
  
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
  const shipTo = String(po.shipToName || poItems.delivery_customer_name || poItems.customer_name || poItems.ship_via || poItems.recipient_name || poItems.attention || "").toLowerCase().trim()
  const poAddress = String(po.shippingAddress || poItems.delivery_address || poItems.shipping_address || poItems.recipient_address || poItems.address || poItems.city || "").toLowerCase().trim()
  
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
  // 3. Product SKU & Line Item Quantity Matcher (Up to 45 points)
  // -------------------------------------------------------------
  const poLineItems = financialZohoLineItems(poItems.lineItems || poItems.line_items || poItems)
  const docLineItems = financialZohoLineItems(docItems.lineItemDetails || docItems.line_items || docItems || doc.lineItems)

  if (Array.isArray(poLineItems) && Array.isArray(docLineItems) && poLineItems.length > 0 && docLineItems.length > 0) {
    let matchedItemLabel = ""
    let hasQtyMatch = false

    for (const poItem of poLineItems) {
      const poSku = String(poItem.sku || poItem.name || poItem.description || "").toLowerCase().trim()
      const poQty = Number(poItem.quantity || poItem.quantity_ordered || poItem.qty || 0)

      if (!poSku || poSku.length < 3) continue

      for (const invItem of docLineItems) {
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
  // 5. Total Amount Proximity Match (Up to 25 points)
  // -------------------------------------------------------------
  const poTotal = Number(po.total || poItems.total || 0)
  const docTotal = Number(doc.amount || docItems.total || 0)

  if (poTotal > 0 && docTotal > 0) {
    const diff = Math.abs(poTotal - docTotal)
    if (diff < 0.01) {
      score += 25
      reasons.push(`Exact Total $${poTotal.toFixed(2)}`)
      matchDetails.amountMatch = `Exact Amount $${poTotal.toFixed(2)}`
    } else if (diff / poTotal < 0.05) {
      score += 15
      reasons.push(`Close Total ($${poTotal.toFixed(2)} vs $${docTotal.toFixed(2)})`)
      matchDetails.amountMatch = `Near Amount ($${poTotal.toFixed(2)} vs $${docTotal.toFixed(2)})`
    }
  }

  const finalScore = Math.min(100, score)
  return { score: finalScore, reasons, matchDetails }
}

