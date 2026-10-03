import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { financialZohoLineItems } from "@/lib/zoho-line-items"

const COMPETITOR_BATTLE_CARDS = [
  {
    name: "Husqvarna (Vari-Cut / Tacti-Cut)",
    weakness: "Higher markup via franchise dealers, shorter segment height (10mm vs Titan 12-15mm).",
    counterPitch: "Point out Titan's 15mm laser-welded undercut segments — 30% longer blade life for 20% lower cost per cut.",
    dealBreakerSpec: "15mm segment height, laser-welded drop segments protect steel core in abrasive asphalt."
  },
  {
    name: "Diamond Products (Core Cut)",
    weakness: "Standard matrix often glazes over on high-PSI cured concrete with hard river rock.",
    counterPitch: "Titan's multi-layered bond matrix with titanium-coated diamond grit stays sharp in 5000+ PSI aggregate.",
    dealBreakerSpec: "Cobalt-infused matrix prevents glazing, free arbor bushings included with every carton."
  },
  {
    name: "Norton Clipper",
    weakness: "Long fulfillment lead times and strict minimum freight thresholds.",
    counterPitch: "Titan ships same-day direct from Scottsdale, AZ with flat contractor freight and no order minimums.",
    dealBreakerSpec: "In-stock guarantee: orders placed before 2 PM MST ship same day."
  },
  {
    name: "Cheap Imports (eBay / Amazon / Direct China)",
    weakness: "High core wobble, thrown segments (dangerous), inconsistent tensioning.",
    counterPitch: "Titan uses German steel cores with pin-hole tensioning and ISO laser welding. Fully certified safety ratings.",
    dealBreakerSpec: "100% money-back safety & segment guarantee on every blade."
  }
]

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get("accountId")
    const phone = (searchParams.get("phone") || "").replace(/[^\d+]/g, "")

    let account: any = null

    if (accountId) {
      account = await prisma.account.findFirst({
        where: { OR: [{ id: accountId }, { zohoId: accountId }] },
        include: {
          contacts: true,
          owner: { select: { id: true, name: true, email: true } },
          invoices: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              amount: true,
              status: true,
              createdAt: true,
              items: true
            }
          },
          salesOrders: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              amount: true,
              status: true,
              orderDate: true,
              items: true
            }
          }
        }
      })
    } else if (phone && phone.length >= 7) {
      const cleanEnd = phone.slice(-10)
      // Search contacts by phone
      const contact: any = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: { contains: cleanEnd } },
            { mobilePhone: { contains: cleanEnd } }
          ]
        },
        include: {
          account: {
            include: {
              contacts: true,
              owner: { select: { id: true, name: true, email: true } },
              invoices: {
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  createdAt: true,
                  items: true
                }
              },
              salesOrders: {
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  orderDate: true,
                  items: true
                }
              }
            }
          }
        }
      })
      if (contact?.account) {
        account = contact.account
      }
    }

    // Extract top previously purchased items
    const itemMap = new Map<string, { name: string; sku: string; count: number; lastPrice: number; lastDate: string }>()
    let totalSpent = 0
    let totalBalance = 0

    if (account) {
      totalBalance = (account.invoices as any[])?.reduce((sum: number, inv: any) => sum + (inv.status === 'OVERDUE' || inv.status === 'SENT' ? Number(inv.amount) || 0 : 0), 0) || 0

      for (const inv of ((account.invoices || []) as any[])) {
        totalSpent += Number(inv.amount) || 0
        const items = financialZohoLineItems(inv.items)
        for (const item of items) {
          const key = item.sku || item.name || item.description
          if (!key) continue
          const existing = itemMap.get(key)
          if (!existing) {
            itemMap.set(key, {
              name: item.name || item.description || key,
              sku: item.sku || "",
              count: Number(item.quantity) || 1,
              lastPrice: Number(item.rate || item.price || 0),
              lastDate: inv.createdAt ? new Date(inv.createdAt).toISOString() : ""
            })
          } else {
            existing.count += (Number(item.quantity) || 1)
          }
        }
      }
    }

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    return NextResponse.json({
      success: true,
      account: account ? {
        id: account.id,
        name: account.name,
        ownerName: account.owner?.name || "Unassigned",
        totalBalance,
        totalSpent,
        isOverdue: totalBalance > 0,
        primaryContact: account.contacts?.find((c: any) => c.isPrimary) || account.contacts?.[0] || null,
        topItems
      } : null,
      competitorBattleCards: COMPETITOR_BATTLE_CARDS,
      suggestedUpsells: [
        { name: "Diamond Core Bits (2\" - 6\")", reason: "High margin add-on for commercial concrete coring jobs" },
        { name: "Premium Dressing Stones", reason: "Essential for unglazing diamond segments in hard aggregate" },
        { name: "Safety Cut-Off Eyewear & Ear Protection", reason: "Standard crew compliance pack" }
      ],
      quickTalkingPoints: [
        "Ask what horsepower saw they are running (gas vs electric vs hydraulic) to confirm matrix hardness.",
        "Check if aggregate is river rock (hard/cobalt) or limestone/sandstone (abrasive/hard-bond).",
        "Offer 10% carton tier if ordering 5 or more blades to secure higher volume."
      ]
    })
  } catch (err: any) {
    console.error("Copilot Intelligence Error:", err)
    return NextResponse.json({ error: err.message || "Failed to load call copilot data" }, { status: 500 })
  }
}
