import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { financialZohoLineItems } from "@/lib/zoho-line-items"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch accounts that are active with invoices
    const accounts = await prisma.account.findMany({
      where: {
        status: { notIn: ["dnr", "closed", "inactive"] },
        invoices: { some: {} }
      },
      include: {
        contacts: true,
        owner: { select: { id: true, name: true, email: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            amount: true,
            createdAt: true,
            items: true
          }
        }
      },
      take: 100
    })

    const predictions: any[] = []
    const now = Date.now()

    for (const acc of (accounts as any[])) {
      if (!acc.invoices || acc.invoices.length < 2) continue

      // Calculate intervals between orders in days
      const dates = acc.invoices
        .map((inv: any) => inv.createdAt ? new Date(inv.createdAt).getTime() : 0)
        .filter((t: number) => t > 0)
        .sort((a: number, b: number) => b - a)

      if (dates.length < 2) continue

      const intervals: number[] = []
      for (let i = 0; i < dates.length - 1; i++) {
        intervals.push(Math.round((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24)))
      }

      const avgIntervalDays = Math.round(intervals.reduce((a: number, b: number) => a + b, 0) / intervals.length)
      if (avgIntervalDays <= 0) continue

      const lastOrderTime = dates[0]
      const daysSinceLastOrder = Math.round((now - lastOrderTime) / (1000 * 60 * 60 * 24))
      const depletionPct = Math.min(100, Math.round((daysSinceLastOrder / avgIntervalDays) * 100))

      // Identify most common blade from line items
      const itemCounts = new Map<string, { name: string; sku: string; qty: number }>()
      for (const inv of acc.invoices) {
        const lineItems = financialZohoLineItems(inv.items)
        for (const item of lineItems) {
          const key = item.sku || item.name
          if (!key) continue
          const cur = itemCounts.get(key)
          if (!cur) {
            itemCounts.set(key, { name: item.name || key, sku: item.sku || "", qty: Number(item.quantity) || 1 })
          } else {
            cur.qty += (Number(item.quantity) || 1)
          }
        }
      }

      const topItem = Array.from(itemCounts.values()).sort((a, b) => b.qty - a.qty)[0] || {
        name: "Standard Diamond Saw Blades",
        sku: "PRO-CUT-14",
        qty: 5
      }

      const primaryContact = acc.contacts?.find((c: any) => c.isPrimary) || acc.contacts?.[0] || null
      const contactPhone = primaryContact?.mobilePhone || primaryContact?.phone || ""
      const contactName = primaryContact?.firstName || acc.name.split(" ")[0]

      // Only recommend reorders when depletion is >= 75%
      if (depletionPct >= 70) {
        predictions.push({
          accountId: acc.id,
          accountName: acc.name,
          contactName,
          phone: contactPhone,
          email: primaryContact?.email || "",
          avgCadenceDays: avgIntervalDays,
          daysSinceLastOrder,
          depletionPercentage: depletionPct,
          urgency: depletionPct >= 95 ? "critical" : depletionPct >= 85 ? "high" : "medium",
          recommendedItem: topItem.name,
          recommendedQty: Math.max(2, Math.round(topItem.qty / acc.invoices.length)),
          suggestedSmsMessage: `Hey ${contactName}, checking in from Titan Diamond! Based on your crew's cadence, you're about 3-4 days from running low on ${topItem.name}. Need me to get another carton pre-staged and shipped to your yard with free contractor freight?`,
          suggestedEmailSubject: `Titan Diamond: Reorder notice for ${acc.name} (${topItem.name})`
        })
      }
    }

    predictions.sort((a, b) => b.depletionPercentage - a.depletionPercentage)

    return NextResponse.json({
      success: true,
      totalPredicted: predictions.length,
      predictions
    })
  } catch (err: any) {
    console.error("Reorder Predictions Error:", err)
    return NextResponse.json({ error: err.message || "Failed to generate reorder predictions" }, { status: 500 })
  }
}
