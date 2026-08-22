import { NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/auth-helpers'
import { getAIProviderStatus } from '@/lib/ai-client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const status = getAIProviderStatus()
    const [activeTools, recentChats, helpfulChats] = await Promise.all([
      prisma.aiCustomTool.count({ where: { isActive: true } }),
      prisma.aiChatLog.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      prisma.aiChatLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, helpful: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      ...status,
      activeTools,
      recentChats,
      helpfulChats,
      helpfulRate: recentChats ? Math.round((helpfulChats / recentChats) * 100) : null,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unable to read AI status' },
      { status: 500 },
    )
  }
}
