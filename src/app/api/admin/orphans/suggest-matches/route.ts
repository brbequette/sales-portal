import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export function computePOMatchScore(po: any, invoice: any) {
  let score = 0
  const reasons: string[] = []

  const invItems = invoice.items || {}
  const poRef = (po.referenceNumber || po.salesOrderNumber || "").trim()
  const invSalesOrderNum = String(invItems.salesOrderNumber || invItems.reference_number || "").trim()

  // 1. Direct Sales Order / Reference Number Match (50 points)
  if (poRef && invSalesOrderNum && (poRef === invSalesOrderNum || invSalesOrderNum.includes(poRef) || poRef.includes(invSalesOrderNum))) {
    score += 50
    reasons.push(`Sales Order #${poRef}`)
  }

  // 2. Customer / Ship-To Name Match (Up to 35 points)
  const shipTo = (po.shipToName || "").toLowerCase().trim()
  const customerName = String(invItems.customer_name || invoice.account?.name || "").toLowerCase().trim()
  
  if (shipTo && customerName) {
    if (shipTo === customerName || customerName.includes(shipTo) || shipTo.includes(customerName)) {
      score += 35
      reasons.push(`Customer '${invoice.account?.name || invItems.customer_name}'`)
    } else {
      const poTokens = shipTo.split(/\s+/).filter((t: string) => t.length > 2)
      const matchesToken = poTokens.some((t: string) => customerName.includes(t))
      if (matchesToken) {
        score += 20
        reasons.push(`Customer Token Match`)
      }
    }
  }

  // 3. Line Item SKU / Product Match (Up to 30 points)
  const poLineItems = po.items?.lineItems || po.items || []
  const invLineItems = invItems.lineItemDetails || invItems.line_items || []

  if (Array.isArray(poLineItems) && Array.isArray(invLineItems) && poLineItems.length > 0 && invLineItems.length > 0) {
    let skuMatched = false
    for (const poItem of poLineItems) {
      const poSku = (poItem.sku || poItem.name || "").toLowerCase().trim()
      if (!poSku) continue
      for (const invItem of invLineItems) {
        const invSku = (invItem.sku || invItem.name || invItem.description || "").toLowerCase().trim()
        if (poSku && invSku && (invSku.includes(poSku) || poSku.includes(invSku))) {
          skuMatched = true
          break
        }
      }
      if (skuMatched) break
    }
    if (skuMatched) {
      score += 30
      reasons.push("Product SKU Match")
    }
  }

  // 4. Date Proximity Match (Up to 15 points)
  if (po.date && invoice.issueDate) {
    const poTime = new Date(po.date).getTime()
    const invTime = new Date(invoice.issueDate).getTime()
    const diffDays = Math.abs(poTime - invTime) / (1000 * 60 * 60 * 24)

    if (diffDays <= 7) {
      score += 15
      reasons.push(`Date ±${Math.round(diffDays)}d`)
    } else if (diffDays <= 14) {
      score += 10
      reasons.push(`Date ±${Math.round(diffDays)}d`)
    } else if (diffDays <= 30) {
      score += 5
      reasons.push(`Date ±${Math.round(diffDays)}d`)
    }
  }

  const finalScore = Math.min(100, score)
  return { score: finalScore, reasons }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const poId = searchParams.get("poId")

    const poWhere: any = { invoiceId: null, isInventoryOrder: false }
    if (poId) poWhere.OR = [{ id: poId }, { zohoId: poId }]

    const pos = await prisma.purchaseOrder.findMany({
      where: poWhere,
      take: poId ? 1 : 50,
      orderBy: { date: "desc" }
    })

    if (pos.length === 0) {
      return NextResponse.json({ success: true, matches: {} })
    }

    // Fetch recent candidate invoices
    const candidateInvoices = await prisma.invoice.findMany({
      take: 200,
      orderBy: { issueDate: "desc" },
      include: { account: { select: { id: true, name: true } } }
    })

    const suggestions: Record<string, any> = {}

    for (const po of pos) {
      let bestMatch: any = null
      let maxScore = 0
      let matchReasons: string[] = []

      for (const inv of candidateInvoices) {
        const { score, reasons } = computePOMatchScore(po, inv)
        if (score > maxScore) {
          maxScore = score
          bestMatch = inv
          matchReasons = reasons
        }
      }

      if (bestMatch && maxScore >= 40) {
        const invData = bestMatch.items as any || {}
        suggestions[po.zohoId] = {
          invoiceId: bestMatch.zohoId,
          invoiceNumber: invData.invoiceNumber || bestMatch.zohoId,
          customerName: bestMatch.account?.name || invData.customer_name || "Unknown Customer",
          issueDate: bestMatch.issueDate,
          score: maxScore,
          reasons: matchReasons
        }
      }
    }

    return NextResponse.json({
      success: true,
      suggestions
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
