import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasValidTvSession } from '@/lib/tv-auth'

export async function GET() {
  if (!(await hasValidTvSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [users, settings] = await Promise.all([
    prisma.user.findMany({
      take: 500,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        showOnSalesBoard: true,
        payoutStructure: true,
        monthlyVigGoals: {
          select: { monthKey: true, profitGoal: true, subtotalGoal: true },
        },
      },
    }),
    prisma.systemSetting.findMany({
      where: { key: { in: ['sales_targets', 'subtotal_targets'] } },
    }),
  ])

  const settingsMap = new Map(settings.map(setting => [setting.key, setting.value]))
  const salesTargets: Record<string, number> = JSON.parse(settingsMap.get('sales_targets') || '{}')
  const subtotalTargets: Record<string, number> = JSON.parse(settingsMap.get('subtotal_targets') || '{}')

  return NextResponse.json({
    success: true,
    users: users.map(user => ({
      ...user,
      dailyProfitGoal: salesTargets[user.id] ?? 1000,
      dailySubtotalGoal: subtotalTargets[user.id] ?? 2000,
    })),
  })
}
