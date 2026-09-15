import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  const [users, settings] = await Promise.all([
    prisma.user.findMany({
      where: { isSalesperson: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        isSalesperson: true,
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
    users: users.filter(user => !['admin', 'administrator', 'master_admin', 'master administrator'].includes(String(user.role || '').trim().toLowerCase())).map(user => ({
      ...user,
      dailyProfitGoal: salesTargets[user.id] ?? 1000,
      dailySubtotalGoal: subtotalTargets[user.id] ?? 2000,
    })),
  })
}
