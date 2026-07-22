import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { NOT: { email: { contains: "dummy.titandiamond.com" } } },
          { NOT: { email: { contains: "example.com" } } },
          { NOT: { name: { contains: "test_migration" } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        constantVigEnabled: true,
        constantVigValue: true
      },
      orderBy: { name: 'asc' }
    })

    const settings = await prisma.systemSetting.findMany()
    const settingsMap = new Map(settings.map(s => [s.key, s.value]))

    const salesTargets: Record<string, number> = JSON.parse(settingsMap.get("sales_targets") || "{}")
    const subtotalTargets: Record<string, number> = JSON.parse(settingsMap.get("subtotal_targets") || "{}")
    const visibleReps: string[] = JSON.parse(settingsMap.get("visible_reps") || "[]")
    const defaultVigRate = parseFloat(settingsMap.get("default_vig_rate") || "1.3")

    const repConfigs = users.map(u => ({
      id: u.id,
      name: u.name || u.email.split('@')[0],
      email: u.email,
      role: u.role,
      isVisible: visibleReps.length === 0 || visibleReps.includes(u.id),
      constantVigEnabled: u.constantVigEnabled ?? false,
      constantVigValue: u.constantVigValue ?? defaultVigRate,
      dailyProfitGoal: salesTargets[u.id] ?? 1000,
      dailySubtotalGoal: subtotalTargets[u.id] ?? 2000
    }))

    return NextResponse.json({
      success: true,
      defaultVigRate,
      repConfigs
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { defaultVigRate, repConfigs } = await req.json()

    // 1. Update Default VIG Rate if provided
    if (defaultVigRate !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'default_vig_rate' },
        update: { value: String(defaultVigRate) },
        create: { key: 'default_vig_rate', value: String(defaultVigRate) }
      })
    }

    if (Array.isArray(repConfigs)) {
      const salesTargets: Record<string, number> = {}
      const subtotalTargets: Record<string, number> = {}
      const visibleReps: string[] = []

      for (const rep of repConfigs) {
        // Update user constant VIG
        await prisma.user.update({
          where: { id: rep.id },
          data: {
            constantVigEnabled: Boolean(rep.constantVigEnabled),
            constantVigValue: parseFloat(rep.constantVigValue) || parseFloat(defaultVigRate) || 1.3
          }
        })

        if (rep.isVisible) {
          visibleReps.push(rep.id)
        }

        salesTargets[rep.id] = parseFloat(rep.dailyProfitGoal) || 0
        subtotalTargets[rep.id] = parseFloat(rep.dailySubtotalGoal) || 0
      }

      // Save targets in SystemSetting
      await prisma.systemSetting.upsert({
        where: { key: 'sales_targets' },
        update: { value: JSON.stringify(salesTargets) },
        create: { key: 'sales_targets', value: JSON.stringify(salesTargets) }
      })

      await prisma.systemSetting.upsert({
        where: { key: 'subtotal_targets' },
        update: { value: JSON.stringify(subtotalTargets) },
        create: { key: 'subtotal_targets', value: JSON.stringify(subtotalTargets) }
      })

      await prisma.systemSetting.upsert({
        where: { key: 'visible_reps' },
        update: { value: JSON.stringify(visibleReps) },
        create: { key: 'visible_reps', value: JSON.stringify(visibleReps) }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
