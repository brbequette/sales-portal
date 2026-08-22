import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const stages = await prisma.salesStage.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" }
    })

    let processedActions = 0
    let scheduledCalls = 0
    let sentMessages = 0

    const now = new Date()

    for (const stage of stages) {
      const flowConfig: any = stage.flowConfig || {}
      const steps = flowConfig.steps || []
      const loopConfig = flowConfig.loopRule || null

      if (steps.length === 0 && !loopConfig) continue

      // Find accounts or leads matching this stage
      const matchingAccounts = await prisma.account.findMany({
        where: { status: { equals: stage.name, mode: "insensitive" } },
        take: 50
      })

      for (const account of matchingAccounts) {
        for (const step of steps) {
          if (step.type === "CALL_TASK") {
            // Check if call task already scheduled
            const existingTask = await prisma.task.findFirst({
              where: { accountId: account.id, subject: { contains: step.title || "Sales Call" } }
            })
            if (!existingTask) {
              const dueDate = new Date()
              dueDate.setHours(dueDate.getHours() + (step.waitHours || 24))
              await prisma.task.create({
                data: {
                  zohoId: `task_flow_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  subject: step.title || `Follow up: ${stage.name}`,
                  description: step.description || `Automated sales flow task for stage ${stage.name}`,
                  ownerId: account.ownerId,
                  accountId: account.id,
                  dueDate,
                  status: "Not Started",
                  priority: step.priority || "Normal"
                }
              })
              scheduledCalls++
            }
          } else if (step.type === "NOTIFICATION") {
            await prisma.notification.create({
              data: {
                userId: account.ownerId,
                title: `Sales Flow Alert: ${account.name}`,
                body: step.message || `Account ${account.name} entered stage ${stage.name}`,
                read: false
              }
            })
            processedActions++
          }
        }

        // Continuous Loop Rule check
        if (loopConfig && loopConfig.enabled && loopConfig.maxInactivityDays) {
          const daysInactive = account.lastCalledAt
            ? (now.getTime() - new Date(account.lastCalledAt).getTime()) / (1000 * 3600 * 24)
            : 999

          if (daysInactive >= loopConfig.maxInactivityDays) {
            // Reset next action date to trigger re-engagement loop
            await prisma.account.update({
              where: { id: account.id },
              data: {
                nextActionDate: new Date(),
                quality: loopConfig.loopQuality || "WARM"
              }
            })
            processedActions++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedActions,
      scheduledCalls,
      sentMessages,
      message: "Sales Flow execution completed successfully"
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
