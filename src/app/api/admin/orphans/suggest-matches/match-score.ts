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
  // 1. Reference Number & Estimate / Sales Order Match (Up to 55 points)
  // -------------------------------------------------------------
  const poRef = String(po.referenceNumber || po.salesOrderNumber || poItems.reference_number || poItems.salesorder_number || po.poNumber || "").trim().toLowerCase()
  
  const invSalesOrderNum = String(invItems.salesOrderNumber || invItems.salesorder_number || invItems.reference_number || invItems.invoiceNumber || invoice.zohoId || "").trim().toLowerCase()
  const invRefNum = String(invItems.reference_number || invItems.customer_po || invItems.estimate_number || invItems.estimateNumber || "").trim().toLowerCase()

  // Extract clean digits for reference / estimate matching
  const poDigits = poRef.replace(/\D/g, "")
  const invSoDigits = invSalesOrderNum.replace(/\D/g, "")
  const invRefDigits = invRefNum.replace(/\D/g, "")

  if (poRef && poRef.length >= 2) {
    if (poRef === invSalesOrderNum || poRef === invRefNum) {
      score += 55
      reasons.push(`Ref #${poRef.toUpperCase()} Exact Match`)
      matchDetails.referenceMatch = `Exact Ref #${poRef.toUpperCase()}`
    } else if (invSalesOrderNum.includes(poRef) || poRef.includes(invSalesOrderNum) || invRefNum.includes(poRef) || (poRef.length >= 3 && invRefNum.includes(poRef))) {
      score += 40
      reasons.push(`Ref #${poRef.toUpperCase()} Match`)
      matchDetails.referenceMatch = `Ref #${poRef.toUpperCase()}`
    } else if (poDigits.length >= 4 && (invSoDigits === poDigits || invRefDigits === poDigits)) {
      score += 40
      reasons.push(`Ref Number #${poDigits} Match`)
      matchDetails.referenceMatch = `Ref Number #${poDigits}`
    }
  }

  // -------------------------------------------------------------
  // 2. Customer / Ship-To Name & Address Match (Up to 45 points)
  // -------------------------------------------------------------
  const shipTo = String(po.shipToName || poItems.delivery_customer_name || poItems.customer_name || poItems.ship_via || poItems.recipient_name || poItems.attention || "").toLowerCase().trim()
  const poAddress = String(po.shippingAddress || poItems.delivery_address || poItems.shipping_address || poItems.recipient_address || poItems.address || poItems.city || "").toLowerCase().trim()
  
  const customerName = String(invoice.account?.name || invItems.customer_name || "").toLowerCase().trim()
  const invAddress = String(invItems.shipping_address || invItems.billing_address || invItems.address || invoice.account?.mailingStreet || "").toLowerCase().trim()

  if (shipTo && customerName) {
    if (shipTo === customerName || customerName.includes(shipTo) || shipTo.includes(customerName)) {
      score += 35
      reasons.push(`Customer '${invoice.account?.name || invItems.customer_name}'`)
      matchDetails.addressMatch = `Customer '${invoice.account?.name || invItems.customer_name}'`
    } else {
      const poTokens = shipTo.split(/\s+/).filter((t: string) => t.length > 2)
      const matchesToken = poTokens.some((t: string) => customerName.includes(t))
      if (matchesToken) {
        score += 20
        reasons.push(`Customer Token Match`)
        matchDetails.addressMatch = `Customer Token Match`
      }
    }
  }

  // Shipping Address Matching (Street, City, State, Zip)
  if (poAddress && poAddress.length > 4) {
    if (invAddress && invAddress.length > 4) {
      const poAddTokens = poAddress.split(/[\s,]+/).filter((t: string) => t.length > 3)
      const matchedAddTokens = poAddTokens.filter((t: string) => invAddress.includes(t))
      if (matchedAddTokens.length >= 2 || invAddress.includes(poAddress) || poAddress.includes(invAddress)) {
        score += 25
        reasons.push(`Address Match: ${matchedAddTokens.join(", ")}`)
        matchDetails.addressMatch = (matchDetails.addressMatch ? `${matchDetails.addressMatch} + ` : "") + `Address match (${matchedAddTokens.join(", ")})`
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Line Item SKU / Product Match (Up to 30 points)
  // -------------------------------------------------------------
  const poLineItems = financialZohoLineItems(poItems.lineItems || poItems.line_items || poItems)
  const invLineItems = financialZohoLineItems(invItems.lineItemDetails || invItems.line_items || invItems)

  if (Array.isArray(poLineItems) && Array.isArray(invLineItems) && poLineItems.length > 0 && invLineItems.length > 0) {
    let matchedItemName = ""
    for (const poItem of poLineItems) {
      const poSku = String(poItem.sku || poItem.name || poItem.description || "").toLowerCase().trim()
      if (!poSku || poSku.length < 3) continue
      for (const invItem of invLineItems) {
        const invSku = String(invItem.sku || invItem.name || invItem.description || "").toLowerCase().trim()
        if (poSku && invSku && (invSku.includes(poSku) || poSku.includes(invSku))) {
          matchedItemName = poItem.name || poItem.sku || poSku
          break
        }
      }
      if (matchedItemName) break
    }
    if (matchedItemName) {
      score += 30
      reasons.push(`Product Match: ${matchedItemName}`)
      matchDetails.itemMatch = `Product: ${matchedItemName}`
    }
  }

  // -------------------------------------------------------------
  // 4. Date Proximity Match (Up to 20 points)
  // -------------------------------------------------------------
  const poDate = po.date ? new Date(po.date) : null
  const invDate = invoice.issueDate ? new Date(invoice.issueDate) : (invItems.date ? new Date(invItems.date) : null)

  if (poDate && invDate && !isNaN(poDate.getTime()) && !isNaN(invDate.getTime())) {
    const diffDays = Math.abs(poDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)

    if (diffDays <= 3) {
      score += 20
      reasons.push(`Date ±${Math.round(diffDays)}d`)
      matchDetails.dateMatch = `Date ±${Math.round(diffDays)}d`
    } else if (diffDays <= 7) {
      score += 15
      reasons.push(`Date ±${Math.round(diffDays)}d`)
      matchDetails.dateMatch = `Date ±${Math.round(diffDays)}d`
    } else if (diffDays <= 14) {
      score += 10
      reasons.push(`Date ±${Math.round(diffDays)}d`)
      matchDetails.dateMatch = `Date ±${Math.round(diffDays)}d`
    } else if (diffDays <= 30) {
      score += 5
      reasons.push(`Date ±${Math.round(diffDays)}d`)
      matchDetails.dateMatch = `Date ±${Math.round(diffDays)}d`
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
