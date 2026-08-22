import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { requireAdministrator } from "@/lib/auth-helpers"

// Helper to determine start and end date of current period based on cadence
function getPeriodBounds(cadence: string, referenceDate: Date = new Date()) {
  const now = new Date(referenceDate)
  const start = new Date(now)
  const end = new Date(now)

  if (cadence === "DAILY") {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (cadence === "WEEKLY") {
    const day = start.getDay() // 0 = Sun
    const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Monday start
    start.setDate(diff)
    start.setHours(0, 0, 0, 0)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else if (cadence === "ANNUALLY") {
    start.setMonth(0, 1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(11, 31)
    end.setHours(23, 59, 59, 999)
  } else {
    // Default: MONTHLY
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(start.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
  }

  return { start, end }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const url = new URL(req.url)
    const repId = url.searchParams.get("repId")
    const scope = url.searchParams.get("scope")
    const cadence = url.searchParams.get("cadence")

    const user = session.user as typeof session.user & { dbId?: string; id?: string; role?: string }
    const actorId = user.dbId || user.id
    const role = (user.role || "").toLowerCase()
    const canViewTeam = role.includes("admin") || role.includes("manager")
    if (!canViewTeam && !actorId) return NextResponse.json({ error: "Signed-in user is not linked to a local account" }, { status: 403 })

    const where: any = {}
    if (canViewTeam && repId) where.OR = [{ repId }, { scope: "TEAM" }]
    if (!canViewTeam) where.OR = [{ repId: actorId }, { scope: "TEAM" }]
    if (scope) where.scope = scope
    if (cadence) where.cadence = cadence

    const [goals, reps] = await Promise.all([
      prisma.performanceGoalBonus.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
      }),
      prisma.user.findMany({
        where: {
          AND: [
            ...(!canViewTeam ? [{ id: actorId }] : []),
            { NOT: { email: { contains: "dummy.titandiamond.com" } } },
            { NOT: { email: { contains: "example.com" } } },
            { NOT: { name: { contains: "test_migration" } } }
          ]
        },
        select: { id: true, name: true, email: true, role: true }
      })
    ])

    // Build a name→id map for salesperson field matching
    const nameToRepId: Record<string, string> = {}
    reps.forEach(r => {
      if (r.name) {
        const lower = r.name.toLowerCase().trim()
        nameToRepId[lower] = r.id
        if (lower.includes("brian basiliere")) {
          nameToRepId["brian basilierre"] = r.id
        }
      }
    })

    // PERF FIX: group goals by cadence so we only query each date window once
    // Instead of fetching ALL invoices once, fetch per unique period window
    const cadenceWindows = new Map<string, { start: Date; end: Date }>()
    goals.forEach(g => {
      if (!cadenceWindows.has(g.cadence)) {
        cadenceWindows.set(g.cadence, getPeriodBounds(g.cadence))
      }
    })

    // Fetch invoices per cadence window (not all invoices at once)
    const invoicesByCadence = new Map<string, any[]>()
    await Promise.all(
      Array.from(cadenceWindows.entries()).map(async ([cad, { start, end }]) => {
        const invs = await prisma.invoice.findMany({
          where: {
            issueDate: { gte: start, lte: end },
            status: { notIn: ["Void", "Draft", "writeoff", "write_off", "bad debt"] }
          },
          select: {
            id: true,
            issueDate: true,
            createdAt: true,
            amount: true,
            items: true,
            account: { select: { ownerId: true } }
          }
        })
        invoicesByCadence.set(cad, invs)
      })
    )

    const goalsWithProgress = goals.map(goal => {
      const { start, end } = cadenceWindows.get(goal.cadence)!
      const allPeriodInvoices = invoicesByCadence.get(goal.cadence) || []

      // Filter to this goal's rep if individual scope
      const periodInvoices = allPeriodInvoices.filter(inv => {
        if (goal.scope === "INDIVIDUAL" && goal.repId) {
          const items = (inv.items as any) || {}
          const salesperson = (items.salesperson || "").toLowerCase().trim()
          const matchedRepId = nameToRepId[salesperson]
          const belongsToRep = matchedRepId === goal.repId || inv.account?.ownerId === goal.repId
          if (!belongsToRep) return false
        }
        return true
      })

      let currentValue = 0
      if (goal.metric === "SUBTOTAL") {
        currentValue = periodInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0)
      } else if (goal.metric === "NET_PROFIT") {
        currentValue = periodInvoices.reduce((sum, inv) => sum + parseFloat((inv.items as any)?.profit || 0), 0)
      } else if (goal.metric === "DEAD_PROFIT") {
        currentValue = periodInvoices.reduce((sum, inv) => sum + parseFloat((inv.items as any)?.deadProfit || 0), 0)
      } else if (goal.metric === "INVOICES_COUNT") {
        currentValue = periodInvoices.length
      }

      const isCompleted = currentValue >= goal.targetValue
      const percentComplete = goal.targetValue > 0 ? Math.min(100, Math.round((currentValue / goal.targetValue) * 100)) : 0

      return {
        ...goal,
        currentValue,
        isCompleted,
        percentComplete,
        periodBounds: {
          start: start.toISOString(),
          end: end.toISOString()
        }
      }
    })

    return NextResponse.json({ success: true, goals: goalsWithProgress, reps })

  } catch (error: any) {
    console.error("GET Goals & Bonuses Error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { title, description, scope, repId, repName, metric, targetValue, bonusAmount, cadence, isActive } = body

    if (!title || !targetValue || !bonusAmount) {
      return NextResponse.json({ success: false, error: "Title, target value, and bonus amount are required." }, { status: 400 })
    }

    const goal = await prisma.performanceGoalBonus.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        scope: scope === "TEAM" ? "TEAM" : "INDIVIDUAL",
        repId: scope === "INDIVIDUAL" ? repId || null : null,
        repName: scope === "INDIVIDUAL" ? repName || null : "All Team Members",
        metric: metric || "SUBTOTAL",
        targetValue: parseFloat(targetValue) || 0,
        bonusAmount: parseFloat(bonusAmount) || 0,
        cadence: cadence || "MONTHLY",
        isActive: isActive ?? true
      }
    })

    return NextResponse.json({ success: true, goal })

  } catch (error: any) {
    console.error("CREATE Goal & Bonus Error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { id, title, description, scope, repId, repName, metric, targetValue, bonusAmount, cadence, isActive } = body

    if (!id) {
      return NextResponse.json({ success: false, error: "Goal ID is required for update." }, { status: 400 })
    }

    const goal = await prisma.performanceGoalBonus.update({
      where: { id },
      data: {
        ...(title ? { title: title.trim() } : {}),
        description: description !== undefined ? (description ? description.trim() : null) : undefined,
        scope: scope ? (scope === "TEAM" ? "TEAM" : "INDIVIDUAL") : undefined,
        repId: scope === "TEAM" ? null : (repId !== undefined ? repId : undefined),
        repName: scope === "TEAM" ? "All Team Members" : (repName !== undefined ? repName : undefined),
        metric: metric || undefined,
        targetValue: targetValue != null ? parseFloat(targetValue) : undefined,
        bonusAmount: bonusAmount != null ? parseFloat(bonusAmount) : undefined,
        cadence: cadence || undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined
      }
    })

    return NextResponse.json({ success: true, goal })

  } catch (error: any) {
    console.error("UPDATE Goal & Bonus Error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return NextResponse.json({ success: false, error: "Goal ID is required for deletion." }, { status: 400 })
    }

    await prisma.performanceGoalBonus.delete({ where: { id } })

    return NextResponse.json({ success: true, message: "Goal bonus rule deleted successfully." })

  } catch (error: any) {
    console.error("DELETE Goal & Bonus Error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
